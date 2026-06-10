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
import { MedicationsService } from './medications.service';
import { JournalService } from './journal.service';
import { CreateMedicationDto } from './dto/create-medication.dto';
import { UpdateMedicationDto } from './dto/update-medication.dto';
import { LogMedicationDto } from './dto/log-medication.dto';
import { UpsertJournalEntryDto } from './dto/upsert-journal-entry.dto';

type AuthenticatedRequest = Request & { user: { id: string; role: string } };

@ApiTags('care')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard)
@Controller('/api')
export class CareController {
  constructor(
    private readonly medications: MedicationsService,
    private readonly journal: JournalService,
  ) {}

  // ----- Medications (caregiver: gated by medication_management) -----

  @Get('/caregiver/patients/:patientId/medications')
  @UseGuards(EntitlementGuard)
  @RequiresEntitlement('medication_management')
  @ApiOperation({ summary: 'List medications for a patient (caregiver)' })
  listMeds(@Req() req: AuthenticatedRequest, @Param('patientId') patientId: string) {
    return this.medications.listForCaregiver(req.user.id, patientId);
  }

  @Post('/caregiver/patients/:patientId/medications')
  @UseGuards(EntitlementGuard)
  @RequiresEntitlement('medication_management')
  @ApiOperation({ summary: 'Add a medication for a patient (caregiver)' })
  createMed(
    @Req() req: AuthenticatedRequest,
    @Param('patientId') patientId: string,
    @Body() dto: CreateMedicationDto,
  ) {
    return this.medications.create(req.user.id, patientId, dto);
  }

  @Patch('/caregiver/patients/:patientId/medications/:medicationId')
  @UseGuards(EntitlementGuard)
  @RequiresEntitlement('medication_management')
  @ApiOperation({ summary: 'Update a medication (caregiver)' })
  updateMed(
    @Req() req: AuthenticatedRequest,
    @Param('patientId') patientId: string,
    @Param('medicationId') medicationId: string,
    @Body() dto: UpdateMedicationDto,
  ) {
    return this.medications.update(req.user.id, patientId, medicationId, dto);
  }

  @Delete('/caregiver/patients/:patientId/medications/:medicationId')
  @UseGuards(EntitlementGuard)
  @RequiresEntitlement('medication_management')
  @ApiOperation({ summary: 'Delete a medication (caregiver)' })
  removeMed(
    @Req() req: AuthenticatedRequest,
    @Param('patientId') patientId: string,
    @Param('medicationId') medicationId: string,
  ) {
    return this.medications.remove(req.user.id, patientId, medicationId);
  }

  @Get('/caregiver/patients/:patientId/medications/adherence')
  @UseGuards(EntitlementGuard)
  @RequiresEntitlement('medication_management')
  @ApiOperation({ summary: 'Medication adherence report (caregiver)' })
  adherence(
    @Req() req: AuthenticatedRequest,
    @Param('patientId') patientId: string,
    @Query('days') days?: string,
  ) {
    return this.medications.getAdherence(
      req.user.id,
      patientId,
      days ? Math.max(1, Math.min(31, parseInt(days, 10))) : 7,
    );
  }

  // ----- Medications (patient device: read + log own intake, not gated) -----

  @Get('/patient/medications')
  @ApiOperation({ summary: "List the patient's own medications" })
  myMeds(@Req() req: AuthenticatedRequest) {
    return this.medications.listForPatient(req.user.id);
  }

  @Get('/patient/medications/today')
  @ApiOperation({ summary: "Today's medication doses for the patient" })
  myMedsToday(@Req() req: AuthenticatedRequest) {
    return this.medications.getToday(req.user.id);
  }

  @Post('/patient/medications/log')
  @ApiOperation({ summary: 'Log a medication intake' })
  logMed(@Req() req: AuthenticatedRequest, @Body() dto: LogMedicationDto) {
    return this.medications.log(req.user.id, dto);
  }

  // ----- Journaling (caregiver: gated by journaling) -----

  @Get('/caregiver/patients/:patientId/journal')
  @UseGuards(EntitlementGuard)
  @RequiresEntitlement('journaling')
  @ApiOperation({ summary: 'List journal entries for a patient (caregiver)' })
  listJournal(@Req() req: AuthenticatedRequest, @Param('patientId') patientId: string) {
    return this.journal.listForCaregiver(req.user.id, patientId);
  }

  @Post('/caregiver/patients/:patientId/journal')
  @UseGuards(EntitlementGuard)
  @RequiresEntitlement('journaling')
  @ApiOperation({ summary: 'Add/update a journal entry for a patient (caregiver)' })
  createJournal(
    @Req() req: AuthenticatedRequest,
    @Param('patientId') patientId: string,
    @Body() dto: UpsertJournalEntryDto,
  ) {
    return this.journal.createForCaregiver(req.user.id, patientId, dto);
  }

  @Delete('/caregiver/patients/:patientId/journal/:entryId')
  @UseGuards(EntitlementGuard)
  @RequiresEntitlement('journaling')
  @ApiOperation({ summary: 'Delete a journal entry (caregiver)' })
  removeJournal(
    @Req() req: AuthenticatedRequest,
    @Param('patientId') patientId: string,
    @Param('entryId') entryId: string,
  ) {
    return this.journal.removeForCaregiver(req.user.id, patientId, entryId);
  }

  // ----- Journaling (patient device: own entries, not gated) -----

  @Get('/patient/journal')
  @ApiOperation({ summary: "List the patient's own journal entries" })
  myJournal(@Req() req: AuthenticatedRequest) {
    return this.journal.list(req.user.id);
  }

  @Post('/patient/journal')
  @ApiOperation({ summary: 'Add/update the daily journal entry (patient)' })
  upsertMyJournal(@Req() req: AuthenticatedRequest, @Body() dto: UpsertJournalEntryDto) {
    return this.journal.upsert(req.user.id, null, dto);
  }
}
