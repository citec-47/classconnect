import { Body, Controller, Get, Headers, Param, Post, Query, Req } from '@nestjs/common';
import type { Request } from 'express';
import { z } from 'zod';
import { VisitorChatService } from './visitor-chat.service';
import { zodBody, uuidParam } from '../common/zod-validation.pipe';
import { CurrentUser, Public, RequirePermissions, type AuthenticatedUser } from '../rbac/decorators';

const openChatSchema = z.object({
  /** Asked for, never required — see the service. */
  visitorName: z.string().max(120).trim().optional(),
  visitorEmail: z.string().email().max(320).optional(),
});
type OpenChatInput = z.infer<typeof openChatSchema>;

const sendSchema = z.object({ body: z.string().min(1).max(4_000) });
type SendInput = z.infer<typeof sendSchema>;

/**
 * The visitor half of live chat. Public, because a visitor has no account.
 *
 * **No route here takes a session id.** The visitor's only handle is the token
 * they were given when the widget opened, sent as `x-chat-token`, and the
 * service resolves it to exactly one session. That is what keeps ten concurrent
 * conversations apart: not a check that could be forgotten, but the absence of
 * any way to name somebody else's session.
 *
 * The token travels in a header rather than the path so it stays out of server
 * access logs and out of a `Referer` — it is a credential, and a credential in a
 * URL ends up written down somewhere.
 */
@Controller('chat')
export class VisitorChatController {
  constructor(private readonly chat: VisitorChatService) {}

  /**
   * The client's address, as far as it can be trusted.
   *
   * `app.set('trust proxy', 1)` is already configured, so Express has resolved
   * this from `x-forwarded-for`. Used only to bound how many sessions one source
   * can open in an hour; NFR-SEC-009 keeps it out of logs.
   */
  private ip(request: Request): string | undefined {
    return request.ip ?? undefined;
  }

  @Public()
  @Post('session')
  async open(@Body(zodBody(openChatSchema)) body: OpenChatInput, @Req() request: Request) {
    return this.chat.createSession({ ...body, visitorIp: this.ip(request) });
  }

  @Public()
  @Get('messages')
  async mine(@Headers('x-chat-token') token?: string) {
    return this.chat.visitorMessages(token ?? '');
  }

  @Public()
  @Post('messages')
  async send(
    @Body(zodBody(sendSchema)) body: SendInput,
    @Headers('x-chat-token') token?: string,
  ) {
    return this.chat.visitorSend(token ?? '', body.body);
  }
}

/**
 * The desk half. Admin and customer service.
 *
 * `support:read:own` is what customer service already holds for its own queue,
 * so answering a visitor needs no new grant — and admins hold it too. A separate
 * controller rather than more routes on the one above, so that nothing here can
 * be reached by a visitor through a mistake in one decorator.
 */
@Controller('admin/chat')
export class StaffChatController {
  constructor(private readonly chat: VisitorChatService) {}

  @Get('sessions')
  @RequirePermissions('support:read:own')
  async queue(@Query('filter') filter?: 'open' | 'waiting' | 'active' | 'closed') {
    return this.chat.queue(filter ?? 'open');
  }

  @Get('sessions/:sessionId')
  @RequirePermissions('support:read:own')
  async conversation(@Param('sessionId', uuidParam()) sessionId: string) {
    return this.chat.staffMessages(sessionId);
  }

  @Post('sessions/:sessionId/messages')
  @RequirePermissions('support:read:own')
  async reply(
    @CurrentUser() user: AuthenticatedUser,
    @Param('sessionId', uuidParam()) sessionId: string,
    @Body(zodBody(sendSchema)) body: SendInput,
  ) {
    return this.chat.staffSend(user, sessionId, body.body);
  }

  @Post('sessions/:sessionId/close')
  @RequirePermissions('support:read:own')
  async close(
    @CurrentUser() user: AuthenticatedUser,
    @Param('sessionId', uuidParam()) sessionId: string,
  ) {
    return this.chat.close(user, sessionId);
  }
}
