import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import { zodBody } from '../common/zod-validation.pipe';
import { CurrentUser, RequirePermissions, type AuthenticatedUser } from '../rbac/decorators';
import { AdminMessagingService } from './admin-messaging.service';
import { AuditService } from '../audit/audit.service';

/**
 * Staff messaging — the other end of "ClassConnect help".
 *
 * Scoped to support threads only. A learner–teacher conversation is reachable
 * through the safeguarding queue, which records who read it and why (FR-RBA-004);
 * putting it on a general inbox would make that record meaningless.
 *
 * Every staff read of a learner's conversation is audited here for the same
 * reason. A support agent opening a child's messages is a legitimate act, and it
 * is also exactly the act that must leave a trace.
 */

const replySchema = z.object({
  body: z.string().max(4000).default(''),
  attachmentIds: z.array(z.string().uuid()).max(5).optional(),
});

@Controller('admin/messages')
export class AdminMessagingController {
  constructor(
    private readonly messaging: AdminMessagingService,
    private readonly audit: AuditService,
  ) {}

  @Get()
  @RequirePermissions('support:read:any')
  async inbox(@Query('q') q?: string) {
    return this.messaging.inbox(q);
  }

  @Get(':threadId')
  @RequirePermissions('support:read:any')
  async thread(
    @CurrentUser() staff: AuthenticatedUser,
    @Param('threadId') threadId: string,
  ) {
    const thread = await this.messaging.thread(threadId, staff.preferredLanguage ?? 'en');

    // FR-RBA-004: staff access to a learner's personal data is recorded.
    await this.audit.record({
      action: 'support.thread_read',
      entity: 'message_thread',
      entityId: threadId,
      actorId: staff.id,
    });

    return thread;
  }

  @Post(':threadId/reply')
  @RequirePermissions('support:read:any')
  async reply(
    @CurrentUser() staff: AuthenticatedUser,
    @Param('threadId') threadId: string,
    @Body(zodBody(replySchema)) body: z.infer<typeof replySchema>,
  ) {
    const sent = await this.messaging.reply(threadId, staff.id, body.body, body.attachmentIds ?? []);

    await this.audit.record({
      action: 'support.replied',
      entity: 'message_thread',
      entityId: threadId,
      actorId: staff.id,
    });

    return sent;
  }
}
