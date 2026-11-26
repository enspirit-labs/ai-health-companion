import { Controller, Get, Param, Query, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';

import { CurrentUser, type RequestUser } from '../auth/decorators/current-user.decorator';
import { parsePositiveInt } from '../common/pagination.util';
import { ReportsService } from './reports.service';

@ApiTags('reports')
@ApiBearerAuth()
@Controller('reports')
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Get()
  list(@CurrentUser() user: RequestUser, @Query('page') page?: string, @Query('limit') limit?: string) {
    return this.reportsService.list(user.id, { page: parsePositiveInt(page), limit: parsePositiveInt(limit) });
  }

  @Get(':id')
  getOne(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.reportsService.getOne(user.id, id);
  }

  @Get(':id/pdf')
  async getPdf(@CurrentUser() user: RequestUser, @Param('id') id: string, @Res() res: Response) {
    const { buffer, filename } = await this.reportsService.getPdfBuffer(user.id, id);
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Length': String(buffer.length),
    });
    res.send(buffer);
  }
}
