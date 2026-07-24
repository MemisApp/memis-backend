import { Controller, Get, Param, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { ActivityService } from './activity.service';

type AuthenticatedRequest = Request & { user: { id: string; role: string } };

@ApiTags('activity')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard)
@Controller('/api')
export class ActivityController {
  constructor(private readonly activity: ActivityService) {}

  @Get('/caregiver/activity')
  @ApiOperation({ summary: 'Recent activity across all linked patients' })
  getAll(
    @Req() req: AuthenticatedRequest,
    @Query('limit') limit?: string,
  ) {
    return this.activity.getForCaregiver(req.user.id, {
      limit: limit ? parseInt(limit, 10) : undefined,
    });
  }

  @Get('/caregiver/patients/:patientId/activity')
  @ApiOperation({ summary: 'Recent activity for one patient' })
  getForPatient(
    @Req() req: AuthenticatedRequest,
    @Param('patientId') patientId: string,
    @Query('limit') limit?: string,
  ) {
    return this.activity.getForCaregiver(req.user.id, {
      patientId,
      limit: limit ? parseInt(limit, 10) : undefined,
    });
  }
}
