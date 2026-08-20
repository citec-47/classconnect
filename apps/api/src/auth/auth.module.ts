import { Global, Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { TokenService } from './token.service';
import { OtpService } from './otp.service';
import { PasswordService } from './password.service';
import { TotpService } from './totp.service';
import { JwtAuthGuard } from './jwt-auth.guard';
import { TeachersModule } from '../teachers/teachers.module';

@Global()
@Module({
  // FieldEncryptionService (NFR-SEC-003) protects the TOTP secret as well as
  // identity and payout details, so it is shared rather than duplicated.
  imports: [JwtModule.register({}), TeachersModule],
  controllers: [AuthController],
  providers: [AuthService, TokenService, OtpService, TotpService, PasswordService, JwtAuthGuard],
  exports: [TokenService, PasswordService, JwtAuthGuard, OtpService, TotpService],
})
export class AuthModule {}
