import { Global, Module } from '@nestjs/common';
import { OwnershipService } from './ownership.service';
import { PermissionsGuard } from './permissions.guard';

@Global()
@Module({
  providers: [OwnershipService, PermissionsGuard],
  exports: [OwnershipService, PermissionsGuard],
})
export class RbacModule {}
