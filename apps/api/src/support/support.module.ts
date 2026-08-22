import { Module } from '@nestjs/common';
import { VisitorChatController, StaffChatController } from './visitor-chat.controller';
import { VisitorChatService } from './visitor-chat.service';

/**
 * Live chat with visitors.
 *
 * Its own module rather than a corner of `AdminModule`, because half of it is
 * public and the other half is not. Keeping the two controllers side by side
 * here makes that boundary something you can see in one file, rather than a
 * property you would have to reconstruct by reading decorators across a large
 * admin surface.
 */
// `CoreModule` is @Global, so Prisma arrives without importing anything.
@Module({
  controllers: [VisitorChatController, StaffChatController],
  providers: [VisitorChatService],
})
export class SupportModule {}
