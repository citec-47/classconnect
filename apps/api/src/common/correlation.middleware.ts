import { Injectable, NestMiddleware } from '@nestjs/common';
import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

export interface RequestContext {
  correlationId: string;
  ip?: string;
  userAgent?: string;
  userId?: string;
}

/**
 * NFR-MNT-005: structured logging with correlation IDs spanning client, API and
 * background workers. Holding the ID in AsyncLocalStorage means every log line
 * and audit entry picks it up without being threaded through call signatures.
 */
export const requestContext = new AsyncLocalStorage<RequestContext>();

export function currentContext(): RequestContext | undefined {
  return requestContext.getStore();
}

export const CORRELATION_HEADER = 'x-correlation-id';

@Injectable()
export class CorrelationMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction): void {
    // Honour an inbound ID so a trace started in the client continues here
    // (§3.2 requires every outbound call and inbound webhook to be logged with one).
    const inbound = req.header(CORRELATION_HEADER);
    const correlationId = inbound && inbound.length <= 100 ? inbound : randomUUID();

    res.setHeader(CORRELATION_HEADER, correlationId);

    requestContext.run(
      {
        correlationId,
        ip: req.ip,
        userAgent: req.header('user-agent')?.slice(0, 500),
      },
      () => next(),
    );
  }
}
