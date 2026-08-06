import { Global, Module } from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { SmsTransport } from './sms.transport';

@Global()
@Module({
  providers: [NotificationsService, SmsTransport],
  exports: [NotificationsService, SmsTransport],
})
export class NotificationsModule {}
