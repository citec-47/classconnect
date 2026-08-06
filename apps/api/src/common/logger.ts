import { ConsoleLogger, LogLevel } from '@nestjs/common';
import { currentContext } from './correlation.middleware';
import { maskEmail, maskPhone } from '@classconnect/shared';

/**
 * NFR-MNT-005: structured JSON logging with correlation IDs.
 * NFR-SEC-009: logs never contain passwords, OTPs, tokens, full phone numbers,
 *              card data, or the contents of learner submissions.
 *
 * The redaction below is a safety net, not a licence to pass secrets to the
 * logger. Call sites are still expected to log identifiers, not payloads.
 */

const SENSITIVE_KEYS = new Set([
  'password',
  'newpassword',
  'passwordhash',
  'otp',
  'code',
  'codehash',
  'token',
  'accesstoken',
  'refreshtoken',
  'refreshtokenhash',
  'authorization',
  'cookie',
  'mfasecret',
  'mfacode',
  'cardnumber',
  'cvv',
  'pin',
  'nationalid',
  'payoutwallet',
  'bodytext',
  'response',
]);

const PHONE_PATTERN = /\+?\d{9,15}/g;

export function redact(value: unknown, depth = 0): unknown {
  if (depth > 6) return '[depth-limit]';
  if (value === null || value === undefined) return value;

  if (typeof value === 'string') {
    return value.replace(PHONE_PATTERN, (match) => maskPhone(match));
  }
  if (typeof value === 'bigint') return value.toString();
  if (typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map((v) => redact(v, depth + 1));

  const out: Record<string, unknown> = {};
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    const normalised = key.toLowerCase().replace(/[^a-z]/g, '');
    if (SENSITIVE_KEYS.has(normalised)) {
      out[key] = '[redacted]';
    } else if (normalised === 'email' && typeof raw === 'string') {
      out[key] = maskEmail(raw);
    } else if (normalised === 'phone' || normalised === 'phonee164' || normalised === 'destination') {
      out[key] = typeof raw === 'string' ? maskPhone(raw) : '[redacted]';
    } else {
      out[key] = redact(raw, depth + 1);
    }
  }
  return out;
}

export class JsonLogger extends ConsoleLogger {
  protected printMessages(
    messages: unknown[],
    context?: string,
    logLevel: LogLevel = 'log',
  ): void {
    const ctx = currentContext();
    for (const message of messages) {
      const line = {
        ts: new Date().toISOString(),
        level: logLevel,
        context: context ?? this.context,
        correlationId: ctx?.correlationId,
        userId: ctx?.userId,
        message: typeof message === 'string' ? message : redact(message),
      };
      // One JSON object per line, so any log shipper can parse it.
      process.stdout.write(`${JSON.stringify(line)}\n`);
    }
  }
}
