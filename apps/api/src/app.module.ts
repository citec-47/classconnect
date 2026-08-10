import { Global, MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';

import { PrismaService } from './common/prisma.service';
import { PlatformConfigService } from './common/platform-config.service';
import { CacheService } from './common/cache.service';
import { CorrelationMiddleware } from './common/correlation.middleware';
import { HttpExceptionFilter } from './common/http-exception.filter';

import { AuditModule } from './audit/audit.module';
import { RbacModule } from './rbac/rbac.module';
import { PermissionsGuard } from './rbac/permissions.guard';
import { NotificationsModule } from './notifications/notifications.module';
import { AuthModule } from './auth/auth.module';
import { JwtAuthGuard } from './auth/jwt-auth.guard';
import { FamilyModule } from './family/family.module';
import { LearnerModule } from './learner/learner.module';
import { CatalogueModule } from './catalogue/catalogue.module';
import { TeachersModule } from './teachers/teachers.module';
import { FilesModule } from './files/files.module';
import { BillingModule } from './billing/billing.module';
import { EarningsModule } from './earnings/earnings.module';
import { AdminModule } from './admin/admin.module';
import { HealthController } from './health.controller';

/** Database and configuration are needed everywhere; exported once. */
@Global()
@Module({
  providers: [PrismaService, PlatformConfigService, CacheService],
  exports: [PrismaService, PlatformConfigService, CacheService],
})
class CoreModule {}

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: ['.env', '../../.env'] }),

    /**
     * NFR-AVL-007: rate limiting per IP and per authenticated user on all public
     * endpoints, with stricter limits on OTP, login, password reset and payment
     * initiation. This is the baseline; the OTP-specific limits in FR-AUT-004
     * are enforced in OtpService against the database, because they are
     * per-number rather than per-connection and must survive a restart.
     */
    ThrottlerModule.forRoot([
      { name: 'short', ttl: 1_000, limit: 10 },
      { name: 'medium', ttl: 60_000, limit: 120 },
    ]),

    CoreModule,
    AuditModule,
    RbacModule,
    NotificationsModule,
    AuthModule,
    FamilyModule,
    LearnerModule,
    CatalogueModule,
    TeachersModule,
    FilesModule,
    BillingModule,
    EarningsModule,
    AdminModule,
  ],
  controllers: [HealthController],
  providers: [
    { provide: APP_FILTER, useClass: HttpExceptionFilter },
    // Order matters: throttle, then establish identity, then authorise.
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(CorrelationMiddleware).forRoutes('*');
  }
}
