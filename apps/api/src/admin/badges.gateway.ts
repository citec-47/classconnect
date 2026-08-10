import { Logger, OnModuleDestroy } from '@nestjs/common';
import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import type { Server, WebSocket } from 'ws';
import type { IncomingMessage } from 'node:http';
import { hasPermission, isStaff, type Role } from '@classconnect/shared';
import { CacheService } from '../common/cache.service';
import { TokenService } from '../auth/token.service';
import { DashboardService } from './dashboard.service';

/**
 * §3 / COM-002 / COM-003 — live badge counts.
 *
 * "Counts push over WebSocket and reconcile with a poll every 60 s in case the
 * socket dropped." Both halves matter: this gateway is the push, and the client
 * polls `GET /admin/dashboard/badges` regardless. The poll is the source of
 * truth on reconnect, so a missed push self-corrects within a minute rather than
 * leaving a stale badge until the next reload.
 *
 * Reconnection and exponential backoff are the client's responsibility
 * (COM-003) and live in the web app's `useBadges` hook.
 */
interface Subscriber {
  socket: WebSocket;
  userId: string;
  roles: Role[];
}

@WebSocketGateway({ path: '/api/v1/admin/badges/stream' })
export class BadgesGateway implements OnGatewayConnection, OnGatewayDisconnect, OnModuleDestroy {
  private readonly logger = new Logger(BadgesGateway.name);
  private readonly subscribers = new Map<WebSocket, Subscriber>();
  private sweep?: NodeJS.Timeout;

  @WebSocketServer()
  server?: Server;

  constructor(
    private readonly tokens: TokenService,
    private readonly dashboard: DashboardService,
    private readonly cache: CacheService,
  ) {}

  /**
   * FR-RBA-002: a socket is an endpoint. It authenticates with the same access
   * token as every other call, and a non-staff identity is closed immediately
   * rather than merely sent nothing.
   *
   * The token arrives as a query parameter because the browser WebSocket API
   * cannot set an Authorization header. It is a short-lived access token
   * (FR-AUT-006, <= 15 minutes) and the URL is never logged with its query
   * string — see the redaction in `common/logger`.
   */
  async handleConnection(socket: WebSocket, request: IncomingMessage): Promise<void> {
    try {
      const url = new URL(request.url ?? '', 'http://localhost');
      const token = url.searchParams.get('access_token');
      if (!token) return this.reject(socket, 4401, 'unauthorised');

      // Throws on an invalid or expired token; the catch below closes the socket.
      const claims = await this.tokens.verifyAccessToken(token);
      const roles = claims.roles as Role[];
      if (!isStaff(roles)) return this.reject(socket, 4403, 'forbidden');

      this.subscribers.set(socket, { socket, userId: claims.sub, roles });

      // Send the current counts straight away, so a fresh sidebar is never
      // blank while it waits for the first change.
      await this.pushTo(socket);
    } catch (error) {
      this.logger.warn({
        msg: 'Badge socket rejected',
        error: error instanceof Error ? error.message : String(error),
      });
      this.reject(socket, 4401, 'unauthorised');
    }
  }

  handleDisconnect(socket: WebSocket): void {
    this.subscribers.delete(socket);
  }

  onModuleDestroy(): void {
    if (this.sweep) clearInterval(this.sweep);
    for (const { socket } of this.subscribers.values()) {
      socket.close(1001, 'server_shutdown');
    }
    this.subscribers.clear();
  }

  private reject(socket: WebSocket, code: number, reason: string): void {
    socket.close(code, reason);
  }

  /**
   * Recomputes and pushes to every connected admin.
   *
   * Called after any action that could change a queue. Counts are computed per
   * subscriber because §3's role table means two admins watching the same
   * platform legitimately see different badge sets.
   */
  async broadcast(): Promise<void> {
    /**
     * Drop every cached count first.
     *
     * `broadcast` is called by exactly the actions that move a queue — an
     * approval, an assignment, a payout, a classification — so it is the one
     * place that already knows the counts are now wrong. Clearing here rather
     * than at each call site means an action added later cannot forget to, and
     * keeps §3's "the count decrements only when an item is actioned" literally
     * true instead of up to ten seconds late.
     *
     * Cleared for everyone rather than only the actor: the whole point of a
     * badge is that the other three operators see it move.
     */
    this.cache.invalidatePrefix(CacheService.KEYS.badgesPrefix);

    if (this.subscribers.size === 0) return;
    await Promise.all([...this.subscribers.values()].map((sub) => this.pushTo(sub.socket)));
  }

  /**
   * Pushes an event to every connected admin who is allowed to receive it.
   *
   * Used for lesson-start announcements. Gated on `live:watch` rather than sent
   * to everyone with a socket: a support agent without that permission has no
   * business being told which teacher is alone with which learner, and a
   * notification is a disclosure like any other (FR-RBA-002).
   */
  announce(event: { type: string } & Record<string, unknown>): void {
    for (const subscriber of this.subscribers.values()) {
      if (!hasPermission(subscriber.roles, 'live:watch')) continue;
      if (subscriber.socket.readyState !== 1) continue;

      try {
        subscriber.socket.send(JSON.stringify({ ...event, at: new Date().toISOString() }));
      } catch (error) {
        this.logger.warn({
          msg: 'Failed to push an announcement',
          userId: subscriber.userId,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  private async pushTo(socket: WebSocket): Promise<void> {
    const subscriber = this.subscribers.get(socket);
    if (!subscriber) return;
    // readyState 1 is OPEN. Writing to a closing socket throws, and a badge
    // update is never worth an unhandled rejection.
    if (socket.readyState !== 1) {
      this.subscribers.delete(socket);
      return;
    }

    try {
      const counts = await this.dashboard.badges({
        id: subscriber.userId,
        roles: subscriber.roles,
      });
      socket.send(JSON.stringify({ type: 'badges', counts, at: new Date().toISOString() }));
    } catch (error) {
      this.logger.warn({
        msg: 'Failed to push badge counts',
        userId: subscriber.userId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}
