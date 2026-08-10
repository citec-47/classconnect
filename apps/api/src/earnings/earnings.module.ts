import { Module } from '@nestjs/common';
import { BillingModule } from '../billing/billing.module';
import { TeachersModule } from '../teachers/teachers.module';
import { EarningsService } from './earnings.service';
import { PayoutsService } from './payouts.service';
import { EarningsController } from './earnings.controller';

/**
 * §4.7.3, §4.7.4 and §4.7.5 — the teacher side of the money.
 *
 * Depends on BillingModule for the ledger (every accrual and payout posts a
 * balanced transaction) and on TeachersModule for the field encryption that
 * keeps a payout wallet readable only as a masked preview (NFR-SEC-003).
 */
@Module({
  imports: [BillingModule, TeachersModule],
  controllers: [EarningsController],
  providers: [EarningsService, PayoutsService],
  exports: [EarningsService, PayoutsService],
})
export class EarningsModule {}
