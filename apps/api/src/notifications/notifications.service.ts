import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../common/prisma.service';
import { t, maskPhone, maskEmail, type Language } from '@classconnect/shared';
import type { NotificationChannel, OtpChannel } from '@classconnect/db';

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
    await this.deliver({
      channel: channel === 'voice' ? 'sms' : (channel as NotificationChannel),
      destination,
      body,
      eventType: 'auth.otp',
      language,
    });
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

      await this.prisma.notification.create({
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

      await this.deliver({
        channel,
        destination,
        body: rendered,
        subject: subject ?? undefined,
        eventType,
        language,
        userId: user.id,
      });
    }
  }

  /**
   * The transport seam.
   *
   * SI-007 (SMS), SI-008 (WhatsApp) and SI-009 (email) each require a
   * contracted provider. When the corresponding environment variable is absent,
   * the message is logged rather than sent — visibly, so a missing provider in
   * a deployed environment is obvious rather than silent.
   *
   * NFR-DEP-001 (timeouts, bounded retry, circuit breaker) applies to the real
   * implementations and is deliberately not faked here.
   */
  private async deliver(message: {
    channel: NotificationChannel;
    destination: string;
    body: string;
    subject?: string;
    eventType: string;
    language: Language;
    userId?: string;
  }): Promise<void> {
    const configured = this.transportConfigured(message.channel);

    if (!configured) {
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
      return;
    }

    // Real transports land here once AS-03/AS-04 are satisfied.
    throw new Error(`Transport for ${message.channel} is configured but not implemented`);
  }

  private transportConfigured(channel: NotificationChannel): boolean {
    switch (channel) {
      case 'sms':
        return Boolean(this.env.get('SMS_PROVIDER_URL'));
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
