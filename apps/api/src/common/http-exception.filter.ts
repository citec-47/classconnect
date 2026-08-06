import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Response } from 'express';
import { currentContext } from './correlation.middleware';

/**
 * NFR-USA-004: an error states what went wrong, why, and what the user can do —
 * never a raw code alone. The API returns a message *key*; the client renders it
 * in the user's language (NFR-LOC-001).
 *
 * NFR-SEC-007: no secret appears in an error message. Unexpected errors are
 * logged server-side with their correlation ID and returned as a generic key.
 */
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('HttpException');

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const correlationId = currentContext()?.correlationId;

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const body = exception.getResponse();

      const payload: Record<string, unknown> =
        typeof body === 'object' && body !== null
          ? { ...(body as Record<string, unknown>) }
          : { messageKey: 'errors.generic' };

      // Give every error a message key so the client always has something to render.
      if (typeof payload.messageKey !== 'string') {
        payload.messageKey = defaultKeyForStatus(status);
      }
      // Nest's default `message` is raw English prose; the client renders from
      // `messageKey` instead (NFR-LOC-001), so it is dropped rather than sent.
      delete payload.message;

      response.status(status).json({ ...payload, statusCode: status, correlationId });
      return;
    }

    this.logger.error({
      msg: 'Unhandled exception',
      correlationId,
      error: exception instanceof Error ? exception.message : String(exception),
      stack: exception instanceof Error ? exception.stack : undefined,
    });

    response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      error: 'internal_error',
      messageKey: 'errors.generic',
      correlationId,
    });
  }
}

/**
 * Throwing helper that keeps the key/params shape identical across services, so
 * every failure the user can see is renderable in both languages.
 */
export class AppError extends HttpException {
  constructor(
    status: HttpStatus,
    messageKey: string,
    params?: Record<string, string | number>,
  ) {
    super({ messageKey, ...(params ? { params } : {}) }, status);
  }

  static badRequest(key: string, params?: Record<string, string | number>): AppError {
    return new AppError(HttpStatus.BAD_REQUEST, key, params);
  }

  static unauthorised(key = 'errors.unauthorised', params?: Record<string, string | number>): AppError {
    return new AppError(HttpStatus.UNAUTHORIZED, key, params);
  }

  static forbidden(key = 'errors.forbidden', params?: Record<string, string | number>): AppError {
    return new AppError(HttpStatus.FORBIDDEN, key, params);
  }

  static notFound(key = 'errors.notFound', params?: Record<string, string | number>): AppError {
    return new AppError(HttpStatus.NOT_FOUND, key, params);
  }

  static conflict(key: string, params?: Record<string, string | number>): AppError {
    return new AppError(HttpStatus.CONFLICT, key, params);
  }

  static tooManyRequests(key: string, params?: Record<string, string | number>): AppError {
    return new AppError(HttpStatus.TOO_MANY_REQUESTS, key, params);
  }
}

function defaultKeyForStatus(status: number): string {
  switch (status) {
    case HttpStatus.UNAUTHORIZED:
      return 'errors.unauthorised';
    case HttpStatus.FORBIDDEN:
      return 'errors.forbidden';
    case HttpStatus.NOT_FOUND:
      return 'errors.notFound';
    case HttpStatus.BAD_REQUEST:
      return 'errors.validation';
    default:
      return 'errors.generic';
  }
}
