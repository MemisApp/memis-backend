import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import {
  EntitlementGuard,
  RequiresEntitlement,
} from '../billing/entitlement.guard';
import { LocationService } from './location.service';
import { CheckInService } from './checkin.service';
import { CareSettingsService } from './care-settings.service';
import { CreateSafeZoneDto } from './dto/create-safe-zone.dto';
import { UpdateSafeZoneDto } from './dto/update-safe-zone.dto';
import { ReportLocationDto } from './dto/report-location.dto';
import { SosDto } from './dto/sos.dto';
import { UpdateCareSettingsDto } from './dto/update-care-settings.dto';

type AuthenticatedRequest = Request & { user: { id: string; role: string } };

@ApiTags('safety')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard)
@Controller('/api')
export class SafetyController {
  constructor(
    private readonly location: LocationService,
    private readonly checkIn: CheckInService,
    private readonly settings: CareSettingsService,
  ) {}

  // ----- Caregiver: live location + safe zones (gated) -----

  @Get('/caregiver/patients/:patientId/location')
  @UseGuards(EntitlementGuard)
  @RequiresEntitlement('safety_location')
  @ApiOperation({ summary: "Latest known location + safe-zone status" })
  getLocation(
    @Req() req: AuthenticatedRequest,
    @Param('patientId') patientId: string,
  ) {
    return this.location.getLatest(req.user.id, patientId);
  }

  @Get('/caregiver/patients/:patientId/location/trail')
  @UseGuards(EntitlementGuard)
  @RequiresEntitlement('safety_location')
  @ApiOperation({ summary: 'Recent location breadcrumb trail' })
  getTrail(
    @Req() req: AuthenticatedRequest,
    @Param('patientId') patientId: string,
    @Query('limit') limit?: string,
  ) {
    return this.location.getTrail(
      req.user.id,
      patientId,
      limit ? parseInt(limit, 10) : 50,
    );
  }

  @Get('/caregiver/patients/:patientId/safe-zones')
  @UseGuards(EntitlementGuard)
  @RequiresEntitlement('safety_location')
  @ApiOperation({ summary: 'List safe zones' })
  listZones(
    @Req() req: AuthenticatedRequest,
    @Param('patientId') patientId: string,
  ) {
    return this.location.listSafeZones(req.user.id, patientId);
  }

  @Post('/caregiver/patients/:patientId/safe-zones')
  @UseGuards(EntitlementGuard)
  @RequiresEntitlement('safety_location')
  @ApiOperation({ summary: 'Create a safe zone' })
  createZone(
    @Req() req: AuthenticatedRequest,
    @Param('patientId') patientId: string,
    @Body() dto: CreateSafeZoneDto,
  ) {
    return this.location.createSafeZone(req.user.id, patientId, dto);
  }

  @Patch('/caregiver/patients/:patientId/safe-zones/:zoneId')
  @UseGuards(EntitlementGuard)
  @RequiresEntitlement('safety_location')
  @ApiOperation({ summary: 'Update a safe zone' })
  updateZone(
    @Req() req: AuthenticatedRequest,
    @Param('patientId') patientId: string,
    @Param('zoneId') zoneId: string,
    @Body() dto: UpdateSafeZoneDto,
  ) {
    return this.location.updateSafeZone(req.user.id, patientId, zoneId, dto);
  }

  @Delete('/caregiver/patients/:patientId/safe-zones/:zoneId')
  @UseGuards(EntitlementGuard)
  @RequiresEntitlement('safety_location')
  @ApiOperation({ summary: 'Delete a safe zone' })
  removeZone(
    @Req() req: AuthenticatedRequest,
    @Param('patientId') patientId: string,
    @Param('zoneId') zoneId: string,
  ) {
    return this.location.removeSafeZone(req.user.id, patientId, zoneId);
  }

  // ----- Caregiver: care settings + check-in history (gated) -----

  @Get('/caregiver/patients/:patientId/care-settings')
  @UseGuards(EntitlementGuard)
  @RequiresEntitlement('safety_location')
  @ApiOperation({ summary: 'Get safety / monitoring settings' })
  getSettings(
    @Req() req: AuthenticatedRequest,
    @Param('patientId') patientId: string,
  ) {
    return this.settings.get(req.user.id, patientId);
  }

  @Patch('/caregiver/patients/:patientId/care-settings')
  @UseGuards(EntitlementGuard)
  @RequiresEntitlement('safety_location')
  @ApiOperation({ summary: 'Update safety / monitoring settings' })
  updateSettings(
    @Req() req: AuthenticatedRequest,
    @Param('patientId') patientId: string,
    @Body() dto: UpdateCareSettingsDto,
  ) {
    return this.settings.update(req.user.id, patientId, dto);
  }

  @Get('/caregiver/patients/:patientId/check-ins')
  @UseGuards(EntitlementGuard)
  @RequiresEntitlement('safety_location')
  @ApiOperation({ summary: 'Recent daily check-ins' })
  checkInHistory(
    @Req() req: AuthenticatedRequest,
    @Param('patientId') patientId: string,
    @Query('limit') limit?: string,
  ) {
    return this.checkIn.history(
      req.user.id,
      patientId,
      limit ? parseInt(limit, 10) : 14,
    );
  }

  // ----- Patient device: report location, SOS, check-in (not gated) -----

  @Post('/patient/location')
  @ApiOperation({ summary: 'Report the patient device location' })
  reportLocation(
    @Req() req: AuthenticatedRequest,
    @Body() dto: ReportLocationDto,
  ) {
    return this.location.ingestPing(req.user.id, dto);
  }

  @Post('/patient/sos')
  @ApiOperation({ summary: 'Trigger an SOS alert to the care circle' })
  sos(@Req() req: AuthenticatedRequest, @Body() dto: SosDto) {
    return this.location.sos(req.user.id, dto);
  }

  @Post('/patient/check-in')
  @ApiOperation({ summary: 'Submit a daily "I\'m OK" check-in' })
  submitCheckIn(@Req() req: AuthenticatedRequest) {
    return this.checkIn.submit(req.user.id);
  }

  @Get('/patient/check-in')
  @ApiOperation({ summary: 'Check-in status for the patient' })
  checkInStatus(@Req() req: AuthenticatedRequest) {
    return this.checkIn.status(req.user.id);
  }
}
