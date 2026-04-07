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
import { ClinicalService } from './clinical.service';
import { AssignPatientDto } from './dto/assign-patient.dto';
import { UpdateAssignmentStatusDto } from './dto/update-assignment-status.dto';
import { UpsertAnamnezeDto } from './dto/upsert-anamneze.dto';
import { CreateClockTestDto } from './dto/create-clock-test.dto';
import { CreateMmseTestDto } from './dto/create-mmse-test.dto';
import { CreateTreatmentDto } from './dto/create-treatment.dto';
import { CreateDoctorNoteDto } from './dto/create-doctor-note.dto';
import { CreateAiRecommendationDto } from './dto/create-ai-recommendation.dto';

type AuthenticatedRequest = Request & {
  user: { id: string; role: string };
};

@ApiTags('clinical')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard)
@Controller('/api')
export class ClinicalController {
  constructor(private readonly clinicalService: ClinicalService) {}

  @Get('/doctor/patients/search')
  @ApiOperation({ summary: 'Search patients for doctor assignment' })
  searchPatients(@Query('q') q = '') {
    return this.clinicalService.searchPatients(q);
  }

  @Get('/doctor/patients')
  @ApiOperation({ summary: 'Get doctor assigned patients' })
  getDoctorPatients(
    @Req() req: AuthenticatedRequest,
    @Query('status') status?: string,
  ) {
    return this.clinicalService.getDoctorPatients(req.user.id, req.user.role, status);
  }

  @Post('/doctor/patients')
  @ApiOperation({ summary: 'Assign patient to doctor' })
  assignPatient(@Req() req: AuthenticatedRequest, @Body() dto: AssignPatientDto) {
    return this.clinicalService.assignPatient(req.user.id, req.user.role, dto);
  }

  @Patch('/doctor/patients/:assignmentId')
  @ApiOperation({ summary: 'Update doctor assignment status' })
  updateAssignmentStatus(
    @Req() req: AuthenticatedRequest,
    @Param('assignmentId') assignmentId: string,
    @Body() dto: UpdateAssignmentStatusDto,
  ) {
    return this.clinicalService.updateAssignmentStatus(
      req.user.id,
      req.user.role,
      assignmentId,
      dto,
    );
  }

  @Delete('/doctor/patients/:assignmentId')
  @ApiOperation({ summary: 'Remove doctor assignment' })
  removeAssignment(
    @Req() req: AuthenticatedRequest,
    @Param('assignmentId') assignmentId: string,
  ) {
    return this.clinicalService.removeAssignment(
      req.user.id,
      req.user.role,
      assignmentId,
    );
  }

  @Get('/doctor/patients/:patientId/profile')
  @ApiOperation({ summary: 'Doctor view of patient profile' })
  getPatientProfile(
    @Req() req: AuthenticatedRequest,
    @Param('patientId') patientId: string,
  ) {
    return this.clinicalService.getPatientProfileForDoctor(
      req.user.id,
      req.user.role,
      patientId,
    );
  }

  @Get('/doctor/patients/:patientId/anamneze')
  @ApiOperation({ summary: 'Get anamneze entries for patient' })
  getAnamneze(
    @Req() req: AuthenticatedRequest,
    @Param('patientId') patientId: string,
  ) {
    return this.clinicalService.getAnamneze(req.user.id, req.user.role, patientId);
  }

  @Post('/doctor/patients/:patientId/anamneze')
  @ApiOperation({ summary: 'Create anamneze entry' })
  upsertAnamneze(
    @Req() req: AuthenticatedRequest,
    @Param('patientId') patientId: string,
    @Body() dto: UpsertAnamnezeDto,
  ) {
    return this.clinicalService.upsertAnamneze(
      req.user.id,
      req.user.role,
      patientId,
      dto,
    );
  }

  @Patch('/doctor/patients/:patientId/anamneze/:anamnezeId')
  @ApiOperation({ summary: 'Update anamneze entry' })
  updateAnamneze(
    @Req() req: AuthenticatedRequest,
    @Param('patientId') patientId: string,
    @Param('anamnezeId') anamnezeId: string,
    @Body() dto: UpsertAnamnezeDto,
  ) {
    return this.clinicalService.updateAnamneze(
      req.user.id,
      req.user.role,
      patientId,
      anamnezeId,
      dto,
    );
  }

  @Delete('/doctor/patients/:patientId/anamneze/:anamnezeId')
  @ApiOperation({ summary: 'Delete anamneze entry' })
  removeAnamneze(
    @Req() req: AuthenticatedRequest,
    @Param('patientId') patientId: string,
    @Param('anamnezeId') anamnezeId: string,
  ) {
    return this.clinicalService.removeAnamneze(
      req.user.id,
      req.user.role,
      patientId,
      anamnezeId,
    );
  }

  @Post('/doctor/patients/:patientId/tests/mmse/assign')
  @ApiOperation({ summary: 'Assign MMSE test to patient' })
  assignMmse(
    @Req() req: AuthenticatedRequest,
    @Param('patientId') patientId: string,
  ) {
    return this.clinicalService.assignMmse(req.user.id, req.user.role, patientId);
  }

  @Post('/doctor/patients/:patientId/tests/clock/assign')
  @ApiOperation({ summary: 'Assign clock drawing test to patient' })
  assignClock(
    @Req() req: AuthenticatedRequest,
    @Param('patientId') patientId: string,
  ) {
    return this.clinicalService.assignClockTest(
      req.user.id,
      req.user.role,
      patientId,
    );
  }

  @Get('/doctor/patients/:patientId/tests/mmse')
  @ApiOperation({ summary: 'Get MMSE results over time' })
  getMmseResults(
    @Req() req: AuthenticatedRequest,
    @Param('patientId') patientId: string,
  ) {
    return this.clinicalService.getMmseAnalytics(req.user.id, req.user.role, patientId);
  }

  @Get('/doctor/patients/:patientId/tests/clock')
  @ApiOperation({ summary: 'Get clock test gallery' })
  getClockGallery(
    @Req() req: AuthenticatedRequest,
    @Param('patientId') patientId: string,
  ) {
    return this.clinicalService.getClockGallery(req.user.id, req.user.role, patientId);
  }

  @Post('/patient/tests/clock')
  @ApiOperation({ summary: 'Patient submits clock drawing test' })
  submitClockTest(@Req() req: AuthenticatedRequest, @Body() dto: CreateClockTestDto) {
    return this.clinicalService.submitClockTest(req.user.id, dto);
  }

  @Post('/patient/tests/mmse')
  @ApiOperation({ summary: 'Patient submits MMSE test answers' })
  submitMmseTest(@Req() req: AuthenticatedRequest, @Body() dto: CreateMmseTestDto) {
    return this.clinicalService.submitMmseTest(req.user.id, dto);
  }

  @Get('/patient/tests/pending')
  @ApiOperation({ summary: 'Get pending/due tests for patient' })
  getPendingTests(@Req() req: AuthenticatedRequest) {
    return this.clinicalService.getPendingTestsForPatient(req.user.id);
  }

  @Post('/doctor/patients/:patientId/treatments')
  @ApiOperation({ summary: 'Assign treatment to patient' })
  createTreatment(
    @Req() req: AuthenticatedRequest,
    @Param('patientId') patientId: string,
    @Body() dto: CreateTreatmentDto,
  ) {
    return this.clinicalService.createTreatment(
      req.user.id,
      req.user.role,
      patientId,
      dto,
    );
  }

  @Get('/doctor/patients/:patientId/treatments')
  @ApiOperation({ summary: 'Get treatments for doctor view' })
  getDoctorTreatments(
    @Req() req: AuthenticatedRequest,
    @Param('patientId') patientId: string,
  ) {
    return this.clinicalService.getTreatmentsForDoctor(
      req.user.id,
      req.user.role,
      patientId,
    );
  }

  @Get('/patient/treatments')
  @ApiOperation({ summary: 'Get current patient treatments' })
  getPatientTreatments(@Req() req: AuthenticatedRequest) {
    return this.clinicalService.getTreatmentsForPatient(req.user.id);
  }

  @Post('/doctor/patients/:patientId/notes')
  @ApiOperation({ summary: 'Create private doctor note' })
  createDoctorNote(
    @Req() req: AuthenticatedRequest,
    @Param('patientId') patientId: string,
    @Body() dto: CreateDoctorNoteDto,
  ) {
    return this.clinicalService.createDoctorNote(
      req.user.id,
      req.user.role,
      patientId,
      dto,
    );
  }

  @Get('/doctor/patients/:patientId/notes')
  @ApiOperation({ summary: 'List private doctor notes' })
  getDoctorNotes(
    @Req() req: AuthenticatedRequest,
    @Param('patientId') patientId: string,
  ) {
    return this.clinicalService.getDoctorNotes(req.user.id, req.user.role, patientId);
  }

  @Get('/doctor/patients/:patientId/timeline')
  @ApiOperation({ summary: 'Get clinical timeline for patient' })
  getTimeline(
    @Req() req: AuthenticatedRequest,
    @Param('patientId') patientId: string,
  ) {
    return this.clinicalService.getTimeline(req.user.id, req.user.role, patientId);
  }

  @Post('/doctor/patients/:patientId/ai/recommendations')
  @ApiOperation({ summary: 'Generate AI treatment recommendation for doctor' })
  generateRecommendation(
    @Req() req: AuthenticatedRequest,
    @Param('patientId') patientId: string,
    @Body() dto: CreateAiRecommendationDto,
  ) {
    return this.clinicalService.generateAiRecommendation(
      req.user.id,
      req.user.role,
      patientId,
      dto,
    );
  }

  @Get('/notifications')
  @ApiOperation({ summary: 'Get app notifications for current user/patient' })
  getNotifications(@Req() req: AuthenticatedRequest) {
    return this.clinicalService.getNotifications(req.user.id, req.user.role);
  }

  @Post('/notifications/:notificationId/read')
  @ApiOperation({ summary: 'Mark notification as read' })
  markNotificationRead(
    @Req() req: AuthenticatedRequest,
    @Param('notificationId') notificationId: string,
  ) {
    return this.clinicalService.markNotificationRead(
      req.user.id,
      req.user.role,
      notificationId,
    );
  }
}
