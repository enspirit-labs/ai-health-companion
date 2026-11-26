import { Body, Controller, Get, Param, Patch, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import {
  UpdateAdminPromptTemplateSchema,
  UpdateAdminUserSchema,
  type UpdateAdminPromptTemplateInput,
  type UpdateAdminUserInput,
} from '@aidoctor/shared';

import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { parsePositiveInt } from '../common/pagination.util';
import { CurrentUser, type RequestUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { AdminService } from './admin.service';

@ApiTags('admin')
@ApiBearerAuth()
@Roles(UserRole.ADMIN)
@Controller('admin')
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get('users')
  listUsers(@Query('page') page?: string, @Query('limit') limit?: string) {
    return this.adminService.listUsers({ page: parsePositiveInt(page), limit: parsePositiveInt(limit) });
  }

  @Patch('users/:id')
  updateUser(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(UpdateAdminUserSchema)) body: UpdateAdminUserInput,
  ) {
    return this.adminService.updateUser(user.id, id, body);
  }

  @Get('stats')
  getStats() {
    return this.adminService.getStats();
  }

  @Get('prompt-templates')
  listPromptTemplates() {
    return this.adminService.listPromptTemplates();
  }

  @Patch('prompt-templates/:id')
  updatePromptTemplate(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(UpdateAdminPromptTemplateSchema)) body: UpdateAdminPromptTemplateInput,
  ) {
    return this.adminService.updatePromptTemplate(user.id, id, body);
  }
}
