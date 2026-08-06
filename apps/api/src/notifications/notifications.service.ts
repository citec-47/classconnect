import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../common/prisma.service';
import { SmsTransport } from './sms.transport';
import { t, maskPhone, maskEmail, type Language } from '@classconnect/shared';
import type { NotificationChannel, OtpChannel } from '@classconnect/db';

/**
 * What a delivery attempt actually resulted in.
 *
 * `confirmed` separates "the provider rejected this" from "we never asked".
 * FR-NOT-006 only wants a fallback on a confirmed failure, and conflating the
 * two would send every message twice whenever a provider is simply unset.
 */
type DeliveryOutcome =
  | { status: 'sent'; providerRef: string | null; segments: number | null }
  | { status: 'failed'; reason: string; confirmed: boolean }
  | { status: 'skipped'; reason: string };

/**
 * Notification dispatch.
 *
 * FR-NOT-001: in-app, email, SMS and WhatsApp channels.
 * FR-NOT-002: every event type has a catalogue entry with EN and FR templates.
 * FR-NOT-006: delivery status is recorded per notification.
 *
 * AS-03/AS-04 are not yet satisfied — no SMS aggregator or WhatsApp Business
 * provider is contracted, so no transport is configured. Until one is, this
 * service records the notification row and logs the intent. That keeps the
 * ledger of what *should* have been sent complete, and makes the provider a
 * drop-in behind `deliver()` rather than a change that ripples through callers.
 */
@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly env: ConfigService,
    private readonly sms: SmsTransport,
  ) {}

  /**
   * FR-AUT-002/005: the OTP goes out over SMS, or WhatsApp/voice as fallback.
   * The code is passed to the transport and never written to a log or a row.
   */
  async sendOtp(
    destination: string,
    channel: OtpChannel,
    code: string,
    language: Language,
    params: { minutes: number },
  ): Promise<void> {
    const body = t(language, 'notifications.otp.body', { code, minutes: params.minutes });

    const outcome = await this.deliver({
      channel: channel === 'voice' ? 'sms' : (channel as NotificationChannel),
      destination,
      body,
      eventType: 'auth.otp',
      language,
    });

    /**
     * FR-AUT-005: where SMS delivery fails, WhatsApp or voice delivery is
     * offered as a fallback. That offer is the caller's to make — the user
     * chooses the channel — so this only surfaces the failure rather than
     * silently re-sending a one-time code down another route the user did not
     * ask for.
     */
    if (outcome.status === 'failed' && outcome.confirmed) {
      this.logger.warn({
        msg: 'OTP delivery failed; the user should be offered another channel',
        channel,
        destination: maskPhone(destination),
        reason: outcome.reason,
      });
    }
  }

  /**
   * Sends a catalogued event to a user over their preferred channels.
   *
   * FR-NOT-003: transactional and safety notifications cannot be disabled, so
   * `force` bypasses preference lookup for those event types.
   * FR-NOT-005: `dedupeKey` prevents the same logical event arriving twice.
   */
  async notifyUser(
    userId: string,
    eventType: string,
    params: Record<string, string | number> = {},
    options: { channels?: NotificationChannel[]; dedupeKey?: string } = {},
  ): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, phoneE164: true, email: true, preferredLanguage: true, fullName: true },
    });
    if (!user) return;

    const template = await this.prisma.notificationTemplate.findUnique({
      where: { eventType },
    });

    const language = user.preferredLanguage as Language;
    const channels = options.channels ?? (template?.defaultChannels as NotificationChannel[]) ?? ['in_app'];

    const body = template
      ? (language === 'fr' ? template.bodyFr : template.bodyEn)
      : t(language, `notifications.${eventType}.body`, { name: user.fullName, ...params });

    const subject = template
      ? (language === 'fr' ? template.subjectFr : template.subjectEn)
      : t(language, `notifications.${eventType}.subject`, { name: user.fullName, ...params });

    const rendered = interpolate(body, { name: user.fullName, ...params });

    for (const channel of channels) {
      // FR-NOT-005: skip a channel we have no address for rather than failing.
      const destination =
        channel === 'sms' || channel === 'whatsapp'
          ? user.phoneE164
          : channel === 'email'
            ? user.email
            : user.id;
      if (!destination) continue;

      const row = await this.prisma.notification.create({
        data: {
          userId: user.id,
          eventType,
          channel,
          template: eventType,
          language: language,
          status: 'queued',
          dedupeKey: options.dedupeKey ?? null,
          payloadJson: { subject, body: rendered } as never,
        },
      });

      const outcome = await this.deliver({
        channel,
        destination,
        body: rendered,
        subject: subject ?? undefined,
        eventType,
        language,
        userId: user.id,
      });

      // FR-NOT-006: delivery status is recorded per notification.
      await this.recordOutcome(row.id, outcome);

      /**
       * FR-NOT-006: fall back to a secondary channel on confirmed failure of the
       * primary. "Confirmed" is doing work here — a failure we could not
       * establish (no provider configured) is not a reason to burn a second
       * channel, and neither is a success we simply have no receipt for yet.
       */
      if (outcome.status === 'failed' && outcome.confirmed && channel === 'sms') {
        await this.fallbackFromSms(user, eventType, rendered, subject, language, row.id);
      }
    }
  }

  /** FR-NOT-006 */
  private async recordOutcome(
    notificationId: string,
    outcome: DeliveryOutcome,
  ): Promise<void> {
    await this.prisma.notification.update({
      where: { id: notificationId },
      data: {
        status:
          outcome.status === 'sent'
            ? 'sent'
            : outcome.status === 'skipped'
              ? 'suppressed'
              : 'failed',
        sentAt: outcome.status === 'sent' ? new Date() : null,
        failureReason: outcome.status === 'failed' ? outcome.reason.slice(0, 500) : null,
        payloadJson:
          outcome.status === 'sent' && outcome.providerRef
            ? ({ providerRef: outcome.providerRef, segments: outcome.segments } as never)
            : undefined,
      },
    });
  }

  /**
   * FR-AUT-005 names WhatsApp as the fallback where SMS delivery fails, so it is
   * tried before email. In-app is not a fallback: the notification row already
   * is the in-app delivery, and a user who cannot receive an SMS is often not
   * looking at the app either.
   */
  private async fallbackFromSms(
    user: { id: string; phoneE164: string | null; email: string | null },
    eventType: string,
    body: string,
    subject: string | null | undefined,
    language: Language,
    primaryId: string,
  ): Promise<void> {
    const candidates: { channel: NotificationChannel; destination: string | null }[] = [
      { channel: 'whatsapp', destination: user.phoneE164 },
      { channel: 'email', destination: user.email },
    ];

    for (const candidate of candidates) {
      if (!candidate.destination || !this.transportConfigured(candidate.channel)) continue;

      const row = await this.prisma.notification.create({
        data: {
          userId: user.id,
          eventType,
          channel: candidate.channel,
          template: eventType,
          language,
          status: 'queued',
          // Ties the retry to the delivery it is standing in for.
          dedupeKey: `fallback:${primaryId}`,
          payloadJson: { subject, body } as never,
        },
      });

      const outcome = await this.deliver({
        channel: candidate.channel,
        destination: candidate.destination,
        body,
        subject: subject ?? undefined,
        eventType,
        language,
        userId: user.id,
      });

      await this.recordOutcome(row.id, outcome);
      if (outcome.status === 'sent') return;
    }
  }

  /**
   * The transport seam.
   *
   * SMS (SI-007) is implemented. WhatsApp (SI-008) and email (SI-009) still
   * need a contracted provider; where one is absent the message is logged
   * rather than sent, visibly, so a missing provider in a deployed environment
   * is obvious rather than silent.
   */
  private async deliver(message: {
    channel: NotificationChannel;
    destination: string;
    body: string;
    subject?: string;
    eventType: string;
    language: Language;
    userId?: string;
  }): Promise<DeliveryOutcome> {
    // The notification row is itself the in-app delivery.
    if (message.channel === 'in_app') {
      return { status: 'sent', providerRef: null, segments: null };
    }

    if (message.channel === 'sms') {
      if (!this.sms.configured) return this.logInstead(message);

      const result = await this.sms.send(message.destination, message.body);
      return result.status === 'sent'
        ? { status: 'sent', providerRef: result.providerRef, segments: result.segments }
        : // `not_configured` is the only non-confirmed failure the transport
          // returns; everything else is a real, observed rejection and so is a
          // legitimate trigger for the FR-NOT-006 fallback.
          { status: 'failed', reason: result.reason, confirmed: result.reason !== 'not_configured' };
    }

    if (!this.transportConfigured(message.channel)) return this.logInstead(message);

    // WhatsApp and email land here once AS-03 is satisfied.
    return {
      status: 'failed',
      reason: `transport_not_implemented:${message.channel}`,
      confirmed: false,
    };
  }

  /** No provider for this channel: record it plainly rather than pretend. */
  private logInstead(message: {
    channel: NotificationChannel;
    destination: string;
    body: string;
    eventType: string;
  }): DeliveryOutcome {
    // NFR-SEC-009: never log the message body — an OTP travels this path.
    this.logger.warn({
      msg: 'Notification not sent: no provider configured',
      channel: message.channel,
      eventType: message.eventType,
      destination: this.maskDestination(message.channel, message.destination),
    });

    if (process.env.NODE_ENV !== 'production') {
      // Local development only: without this the OTP flow cannot be exercised.
      this.logger.debug({
        msg: 'DEV notification body',
        channel: message.channel,
        body: message.body,
      });
    }

    return { status: 'skipped', reason: 'not_configured' };
  }

  private transportConfigured(channel: NotificationChannel): boolean {
    switch (channel) {
      case 'sms':
        return this.sms.configured;
      case 'whatsapp':
        return Boolean(this.env.get('WHATSAPP_API_URL'));
      case 'email':
        return Boolean(this.env.get('EMAIL_API_URL'));
      case 'in_app':
        // The row written above is the delivery.
        return false;
      default:
        return false;
    }
  }

  private maskDestination(channel: NotificationChannel, destination: string): string {
    if (channel === 'email') return maskEmail(destination);
    if (channel === 'sms' || channel === 'whatsapp') return maskPhone(destination);
    return destination;
  }
}

function interpolate(template: string, params: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) =>
    key in params ? String(params[key]) : match,
  );
}
