import { ArgumentMetadata, BadRequestException, Injectable, type PipeTransform } from '@nestjs/common';
import { ZodError, ZodSchema } from 'zod';

/**
 * FR-RBA-002: validation happens server-side. Client-side checks are a
 * convenience for the user and never the integrity control.
 *
 * NFR-USA-004: the error body carries message *keys*, not English prose, so the
 * client renders the user's language (NFR-LOC-001).
 */
export interface FieldError {
  path: string;
  messageKey: string;
}

export class ValidationFailure extends BadRequestException {
  constructor(readonly fields: FieldError[]) {
    super({
      statusCode: 400,
      error: 'validation_failed',
      messageKey: 'errors.validation',
      fields,
    });
  }
}

@Injectable()
export class ZodValidationPipe<T> implements PipeTransform<unknown, T> {
  constructor(private readonly schema: ZodSchema<T>) {}

  transform(value: unknown, _metadata: ArgumentMetadata): T {
    try {
      return this.schema.parse(value);
    } catch (error) {
      if (error instanceof ZodError) {
        throw new ValidationFailure(
          error.issues.map((issue) => ({
            path: issue.path.join('.'),
            // Zod messages are already message keys where we set them; anything
            // else falls back to a generic key so no raw English leaks out.
            messageKey: issue.message.startsWith('errors.')
              ? issue.message
              : `errors.field.${issue.code}`,
          })),
        );
      }
      throw error;
    }
  }
}

/** Convenience factory so controllers read as `@Body(zodBody(schema))`. */
export function zodBody<T>(schema: ZodSchema<T>): ZodValidationPipe<T> {
  return new ZodValidationPipe(schema);
}

/**
 * Validates a UUID path parameter.
 *
 * Every id in this API is a UUID. Passing a malformed one straight to the
 * database makes the driver throw, which surfaces as a 500 — an input error
 * reported as a server fault. NFR-USA-004 wants an actionable message, and a
 * 500 also pollutes the error-rate alerting in NFR-MNT-006 with what is really
 * a bad request.
 */
@Injectable()
export class ParseUuidParamPipe implements PipeTransform<string, string> {
  private static readonly UUID =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

  transform(value: string): string {
    if (typeof value !== 'string' || !ParseUuidParamPipe.UUID.test(value)) {
      throw new BadRequestException({ messageKey: 'errors.notFound' });
    }
    return value;
  }
}

/** Reads as `@Param('id', uuidParam())`. */
export function uuidParam(): ParseUuidParamPipe {
  return new ParseUuidParamPipe();
}
