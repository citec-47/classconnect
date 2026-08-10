import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { TeachersModule } from '../teachers/teachers.module';
import { LedgerService } from './ledger.service';
import { InvoicesService } from './invoices.service';
import { InstalmentsService } from './instalments.service';
import { FreezeService } from './freeze.service';
import { PaymentsAdminService } from './payments-admin.service';
import { ReconciliationService } from './reconciliation.service';
import { BillingSchedulerService } from './billing-scheduler.service';
import { PaymentsAdminController } from './payments-admin.controller';
import { JobsController } from './jobs.controller';

/**
 * §4.7 and §5 — collections, instalments, freezing and reconciliation.
 *
 * `FreezeService` is exported because three other modules need it and none of
 * them should reimplement it: safeguarding suspends a teacher through it, the
 * live-session module applies deferred freezes through it, and the learner
 * entitlement checks ask it what a frozen account may still do.
 */
@Module({
  imports: [AuthModule, TeachersModule],
  controllers: [PaymentsAdminController, JobsController],
  providers: [
    LedgerService,
    InvoicesService,
    InstalmentsService,
    FreezeService,
    PaymentsAdminService,
    ReconciliationService,
    BillingSchedulerService,
  ],
  exports: [
    LedgerService,
    InvoicesService,
    InstalmentsService,
    FreezeService,
    PaymentsAdminService,
    ReconciliationService,
    BillingSchedulerService,
  ],
})
export class BillingModule {}
