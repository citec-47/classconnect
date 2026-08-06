import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post } from '@nestjs/common';
import { FamilyService } from './family.service';
import { zodBody, uuidParam } from '../common/zod-validation.pipe';
import { CurrentUser, RequirePermissions, type AuthenticatedUser } from '../rbac/decorators';
import {
  createLearnerSchema,
  updateLearnerSchema,
  grantLearnerCredentialsSchema,
  inviteGuardianSchema,
  type CreateLearnerInput,
} from '@classconnect/shared';

/** FR-FAM-001..006. Record-level ownership is checked inside the service. */
@Controller('learners')
export class FamilyController {
  constructor(private readonly family: FamilyService) {}

  @Get()
  @RequirePermissions('learner:read:own')
  async list(@CurrentUser() user: AuthenticatedUser) {
    return this.family.listLearners(user);
  }

  @Post()
  @RequirePermissions('learner:create')
  async create(
    @CurrentUser() user: AuthenticatedUser,
    @Body(zodBody(createLearnerSchema)) body: CreateLearnerInput,
  ) {
    return this.family.createLearner(user, body);
  }

  @Get(':id')
  @RequirePermissions('learner:read:own')
  async get(@CurrentUser() user: AuthenticatedUser, @Param('id', uuidParam()) id: string) {
    return this.family.getLearner(user, id);
  }

  @Patch(':id')
  @RequirePermissions('learner:write:own')
  async update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', uuidParam()) id: string,
    @Body(zodBody(updateLearnerSchema)) body: Partial<CreateLearnerInput>,
  ) {
    return this.family.updateLearner(user, id, body);
  }

  /** FR-FAM-005: archive, never delete, while obligations exist. */
  @Delete(':id')
  @HttpCode(204)
  @RequirePermissions('learner:archive:own')
  async archive(@CurrentUser() user: AuthenticatedUser, @Param('id', uuidParam()) id: string): Promise<void> {
    await this.family.archiveLearner(user, id);
  }

  /** FR-FAM-003 */
  @Post(':id/credentials')
  @RequirePermissions('learner:credentials:manage')
  async grantCredentials(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', uuidParam()) id: string,
    @Body(zodBody(grantLearnerCredentialsSchema))
    body: { phone?: string; email?: string; password: string },
  ) {
    return this.family.grantCredentials(user, id, body);
  }

  /** FR-FAM-003: revocable at any time. */
  @Delete(':id/credentials')
  @HttpCode(204)
  @RequirePermissions('learner:credentials:manage')
  async revokeCredentials(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', uuidParam()) id: string,
  ): Promise<void> {
    await this.family.revokeCredentials(user, id);
  }

  /** FR-FAM-004 */
  @Post(':id/guardians')
  @RequirePermissions('guardian:invite')
  async inviteGuardian(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', uuidParam()) id: string,
    @Body(zodBody(inviteGuardianSchema))
    body: { phone?: string; email?: string; accessLevel: 'full' | 'view_only' },
  ) {
    return this.family.inviteGuardian(user, id, body);
  }
}
