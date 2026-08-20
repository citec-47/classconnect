import { Logger, OnModuleDestroy } from '@nestjs/common';
import { OnGatewayConnection, OnGatewayDisconnect, WebSocketGateway } from '@nestjs/websockets';
import type { IncomingMessage } from 'node:http';
import type { WebSocket } from 'ws';
import { PrismaService } from '../common/prisma.service';
import { TokenService } from '../auth/token.service';

/**
 * Pushes a tiny invalidation event for one open thread.
 *
 * The REST endpoint remains the source of truth: a browser receives `message`
 * and reloads the thread, which means a lost or duplicated WebSocket frame can
 * never create a divergent conversation. This is deliberately more robust than
 * treating a socket payload as an alternate message store on an unstable link.
 */
@WebSocketGateway({ path: '/api/v1/learner/messages/stream' })
export class LearnerMessagesGateway implements OnGatewayConnection, OnGatewayDisconnect, OnModuleDestroy {
  private readonly logger = new Logger(LearnerMessagesGateway.name);
  private readonly subscribers = new Map<WebSocket, { threadId: string; userId: string }>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly tokens: TokenService,
  ) {}

  async handleConnection(socket: WebSocket, request: IncomingMessage): Promise<void> {
    try {
      const url = new URL(request.url ?? '', 'http://localhost');
      const token = url.searchParams.get('access_token');
      const threadId = url.searchParams.get('thread');
      if (!token || !threadId) return this.reject(socket, 4401, 'unauthorised');

      const claims = await this.tokens.verifyAccessToken(token);
      const participant = await this.prisma.threadParticipant.findUnique({
        where: { threadId_userId: { threadId, userId: claims.sub } },
        select: { userId: true },
      });
      if (!participant) return this.reject(socket, 4403, 'forbidden');
      this.subscribers.set(socket, { threadId, userId: claims.sub });
      socket.on('message', (raw) => this.handleClientMessage(socket, String(raw)));
    } catch (error) {
      this.logger.warn({ msg: 'Message stream rejected', error: error instanceof Error ? error.message : String(error) });
      this.reject(socket, 4401, 'unauthorised');
    }
  }

  handleDisconnect(socket: WebSocket): void {
    this.subscribers.delete(socket);
  }

  onModuleDestroy(): void {
    for (const socket of this.subscribers.keys()) socket.close(1001, 'server_shutdown');
    this.subscribers.clear();
  }

  publish(threadId: string, senderUserId: string): void {
    for (const [socket, subscriber] of this.subscribers) {
      if (subscriber.threadId !== threadId || subscriber.userId === senderUserId || socket.readyState !== 1) continue;
      try {
        socket.send(JSON.stringify({ type: 'message', threadId, at: new Date().toISOString() }));
      } catch {
        this.subscribers.delete(socket);
      }
    }
  }

  /** A membership, lock, or permission change; clients reload their authority. */
  publishThreadUpdate(threadId: string): void {
    for (const [socket, subscriber] of this.subscribers) {
      if (subscriber.threadId !== threadId || socket.readyState !== 1) continue;
      try {
        socket.send(JSON.stringify({ type: 'thread_updated', threadId, at: new Date().toISOString() }));
      } catch {
        this.subscribers.delete(socket);
      }
    }
  }

  /** Typing is a transient presence signal, never a message or an audit record. */
  private handleClientMessage(socket: WebSocket, raw: string): void {
    const subscriber = this.subscribers.get(socket);
    if (!subscriber) return;
    try {
      const event = JSON.parse(raw) as { type?: string; active?: unknown };
      if (event.type !== 'typing' || typeof event.active !== 'boolean') return;
      this.broadcast(subscriber.threadId, socket, {
        type: 'typing', active: event.active, userId: subscriber.userId,
      });
    } catch {
      // A malformed transient frame never ends a conversation connection.
    }
  }

  private broadcast(threadId: string, sender: WebSocket, event: Record<string, unknown>): void {
    for (const [socket, subscriber] of this.subscribers) {
      if (socket === sender || subscriber.threadId !== threadId || socket.readyState !== 1) continue;
      try { socket.send(JSON.stringify(event)); } catch { this.subscribers.delete(socket); }
    }
  }

  private reject(socket: WebSocket, code: number, reason: string): void {
    socket.close(code, reason);
  }
}
