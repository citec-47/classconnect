import { Module } from '@nestjs/common';
import { AdminAccountsService } from './admin-accounts.service';
import { AdminAccountsController } from './admin-accounts.controller';
import { AdminDashboardController } from './admin-dashboard.controller';
import { GovernanceController } from './governance.controller';
import { DashboardService } from './dashboard.service';
import { ApprovalsService } from './approvals.service';
import { SupportService } from './support.service';
import { SafeguardingService } from './safeguarding.service';
import { GovernanceService } from './governance.service';
import { RosterService } from './roster.service';
import { LiveService } from './live.service';
import { ScheduleService } from './schedule.service';
import { LiveNotifierService } from './live-notifier.service';
import { RosterController } from './roster.controller';
import { AdminMessagingController } from './admin-messaging.controller';
import { AdminMessagingService } from './admin-messaging.service';
import { BadgesGateway } from './badges.gateway';
import { AuthModule } from '../auth/auth.module';
import { TeachersModule } from '../teachers/teachers.module';
import { BillingModule } from '../billing/billing.module';
import { EarningsModule } from '../earnings/earnings.module';

/**
 * The admin surface (§3 to §6 of the admin brief).
 *
 * Account creation was already here; this adds the four things the brief says a
 * team of four must be able to do fast — approve people, see the money, enforce
 * payment, route work — and the fifth that outranks all of them, keeping
 * children safe.
 */
@Module({
  imports: [
    // PasswordService for the credentials it sets, TokenService for the badge
    // socket's authentication and for forcing sign-out.
    AuthModule,
    // FieldEncryptionService for identity and payout details (NFR-SEC-003).
    TeachersModule,
    // FreezeService, ReconciliationService and the payments read models.
    BillingModule,
    EarningsModule,
  ],
  controllers: [
    AdminAccountsController,
    AdminDashboardController,
    GovernanceController,
    RosterController,
    AdminMessagingController,
  ],
  providers: [
    AdminAccountsService,
    DashboardService,
    ApprovalsService,
    SupportService,
    SafeguardingService,
    GovernanceService,
    RosterService,
    LiveService,
    ScheduleService,
    LiveNotifierService,
    BadgesGateway,
    AdminMessagingService,
  ],
  exports: [SafeguardingService, ApprovalsService, SupportService, LiveService, LiveNotifierService],
})
export class AdminModule {}
