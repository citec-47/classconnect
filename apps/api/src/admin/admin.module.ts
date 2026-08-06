import { Module } from '@nestjs/common';
import { AdminAccountsService } from './admin-accounts.service';
import { AdminAccountsController } from './admin-accounts.controller';
import { AuthModule } from '../auth/auth.module';
import { TeachersModule } from '../teachers/teachers.module';

@Module({
  // PasswordService for the credentials it sets, FieldEncryptionService for the
  // identity and payout details it stores (NFR-SEC-003).
  imports: [AuthModule, TeachersModule],
  controllers: [AdminAccountsController],
  providers: [AdminAccountsService],
})
export class AdminModule {}
