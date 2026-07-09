import { Controller, Get, Param, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import {
  EntitlementGuard,
  RequiresEntitlement,
} from '../billing/entitlement.guard';
import { CognitiveService } from './cognitive.service';
import { DigestService, DigestPeriod } from './digest.service';

type AuthenticatedRequest = Request & { user: { id: string; role: string } };

@ApiTags('monitoring')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard)
@Controller('/api')
export class MonitoringController {
  constructor(
    private readonly cognitive: CognitiveService,
    private readonly digest: DigestService,
  ) {}

  @Get('/caregiver/patients/:patientId/cognitive-report')
  @UseGuards(EntitlementGuard)
  @RequiresEntitlement('clinical_insights')
  @ApiOperation({ summary: 'Cognitive trend report (MMSE/clock history)' })
  cognitiveReport(
    @Req() req: AuthenticatedRequest,
    @Param('patientId') patientId: string,
  ) {
    return this.cognitive.getReport(req.user.id, patientId);
  }

  @Get('/caregiver/patients/:patientId/digest')
  @UseGuards(EntitlementGuard)
  @RequiresEntitlement('care_digest')
  @ApiOperation({ summary: 'Preview the care digest for a patient' })
  digestPreview(
    @Req() req: AuthenticatedRequest,
    @Param('patientId') patientId: string,
    @Query('period') period?: string,
  ) {
    const p: DigestPeriod = period === 'WEEKLY' ? 'WEEKLY' : 'DAILY';
    return this.digest.preview(req.user.id, patientId, p);
  }
}
