import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { DoctorPatientStatus, Prisma, Role } from '@prisma/client';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { AssignPatientDto } from './dto/assign-patient.dto';
import { UpdateAssignmentStatusDto } from './dto/update-assignment-status.dto';
import { UpsertAnamnezeDto } from './dto/upsert-anamneze.dto';
import { CreateClockTestDto } from './dto/create-clock-test.dto';
import { CreateMmseTestDto } from './dto/create-mmse-test.dto';
import { CreateTreatmentDto } from './dto/create-treatment.dto';
import { CreateDoctorNoteDto } from './dto/create-doctor-note.dto';
import { CreateAiRecommendationDto } from './dto/create-ai-recommendation.dto';
import { RateClockTestDto } from './dto/rate-clock-test.dto';
import { PushService } from './push.service';

@Injectable()
export class ClinicalService {
  private readonly logger = new Logger(ClinicalService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly pushService: PushService,
  ) {}

  private ensureDoctor(role: string) {
    if (role !== Role.DOCTOR && role !== Role.ADMIN) {
      throw new ForbiddenException('Doctor access required');
    }
  }

  private async ensureDoctorPatientAccess(doctorId: string, patientId: string) {
    const assignment = await this.prisma.doctorPatient.findUnique({
      where: { doctorId_patientId: { doctorId, patientId } },
    });
    if (!assignment || assignment.status !== DoctorPatientStatus.ACTIVE) {
      throw new ForbiddenException('No active assignment for this patient');
    }
  }

  private async ensurePatientExists(patientId: string) {
    const patient = await this.prisma.patient.findUnique({
      where: { id: patientId },
    });
    if (!patient) throw new NotFoundException('Patient not found');
    return patient;
  }

  private extractMmseScore(answers: Record<string, unknown>): number {
    const values = Object.values(answers);
    const total = values.reduce<number>((acc, value) => {
      if (typeof value === 'number') return acc + value;
      if (typeof value === 'boolean') return acc + (value ? 1 : 0);
      if (typeof value === 'string') return acc + (value.trim() ? 1 : 0);
      return acc;
    }, 0);
    return Math.max(0, Math.min(30, Math.round(total)));
  }

  private async createNotification(input: {
    userId?: string;
    patientId?: string;
    title: string;
    body: string;
    type: string;
    actorId?: string;
    metadata?: Record<string, unknown>;
  }) {
    await this.prisma.appNotification.create({
      data: {
        userId: input.userId || null,
        patientId: input.patientId || null,
        title: input.title,
        body: input.body,
        type: input.type,
        actorId: input.actorId || null,
        metadata: input.metadata as Prisma.InputJsonValue | undefined,
      },
    });

    const data = {
      type: input.type,
      ...(input.metadata ?? {}),
    };

    // Fire a real push notification to every registered device for this patient.
    if (input.patientId && !input.userId) {
      this.pushService
        .sendToPatient(input.patientId, input.title, input.body, data)
        .catch((err) => this.logger.error('Patient push failed', err));
    }

    // Fire push to caregiver/doctor user if userId targeted
    if (input.userId) {
      this.pushService
        .sendToUser(input.userId, input.title, input.body, data)
        .catch((err) => this.logger.error('User push failed', err));
    }
  }

  async registerPushToken(patientId: string, devicePublicId: string, token: string) {
    await this.pushService.registerToken(patientId, devicePublicId, token);
  }

  async registerUserPushToken(userId: string, token: string) {
    await this.pushService.registerUserToken(userId, token);
  }

  /**
   * Notify all caregivers (and the patient) about an event on a patient.
   * Also creates AppNotification rows + push notifications.
   */
  private async notifyCaregivers(
    patientId: string,
    title: string,
    body: string,
    type: string,
    metadata?: Record<string, unknown>,
  ) {
    const caregivers = await this.prisma.patientCaregiver.findMany({
      where: { patientId },
      select: { caregiverId: true },
    });

    await Promise.all(
      caregivers.map((c) =>
        this.createNotification({
          userId: c.caregiverId,
          patientId,
          title,
          body,
          type,
          metadata,
        }),
      ),
    );
  }

  async searchPatients(role: string, query: string) {
    this.ensureDoctor(role);
    const term = query.trim();
    if (term.length < 2) return [];

    return this.prisma.patient.findMany({
      where: {
        OR: [
          { firstName: { contains: term, mode: 'insensitive' } },
          { lastName: { contains: term, mode: 'insensitive' } },
        ],
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        birthDate: true,
        avatarUrl: true,
      },
      take: 20,
      orderBy: { updatedAt: 'desc' },
    });
  }

  async getDoctorPatients(doctorId: string, role: string, status?: string) {
    this.ensureDoctor(role);
    const where = {
      doctorId,
      ...(status ? { status: status as DoctorPatientStatus } : {}),
    };

    return this.prisma.doctorPatient.findMany({
      where,
      include: {
        patient: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            birthDate: true,
            avatarUrl: true,
            updatedAt: true,
          },
        },
      },
      orderBy: { updatedAt: 'desc' },
    });
  }

  async assignPatient(doctorId: string, role: string, dto: AssignPatientDto) {
    this.ensureDoctor(role);
    await this.ensurePatientExists(dto.patientId);

    const existing = await this.prisma.doctorPatient.findUnique({
      where: { doctorId_patientId: { doctorId, patientId: dto.patientId } },
    });

    if (existing) {
      return this.prisma.doctorPatient.update({
        where: { id: existing.id },
        data: { status: DoctorPatientStatus.ACTIVE },
      });
    }

    const assignment = await this.prisma.doctorPatient.create({
      data: {
        doctorId,
        patientId: dto.patientId,
      },
    });

    await this.createNotification({
      patientId: dto.patientId,
      title: 'New doctor assigned',
      body: 'A doctor assigned you new assessments (MMSE and clock test).',
      type: 'DOCTOR_ASSIGNED',
      actorId: doctorId,
      metadata: { mmseAssigned: true, clockAssigned: true },
    });
    await this.notifyCaregivers(
      dto.patientId,
      'A doctor was assigned to your patient',
      'New MMSE and clock drawing tests have been assigned.',
      'DOCTOR_ASSIGNED_CAREGIVER',
      { mmseAssigned: true, clockAssigned: true },
    );

    return assignment;
  }

  async updateAssignmentStatus(
    doctorId: string,
    role: string,
    assignmentId: string,
    dto: UpdateAssignmentStatusDto,
  ) {
    this.ensureDoctor(role);
    const assignment = await this.prisma.doctorPatient.findUnique({
      where: { id: assignmentId },
    });
    if (!assignment || assignment.doctorId !== doctorId) {
      throw new NotFoundException('Assignment not found');
    }

    return this.prisma.doctorPatient.update({
      where: { id: assignmentId },
      data: { status: dto.status },
    });
  }

  async removeAssignment(doctorId: string, role: string, assignmentId: string) {
    this.ensureDoctor(role);
    const assignment = await this.prisma.doctorPatient.findUnique({
      where: { id: assignmentId },
    });
    if (!assignment || assignment.doctorId !== doctorId) {
      throw new NotFoundException('Assignment not found');
    }
    await this.prisma.doctorPatient.delete({ where: { id: assignmentId } });
    return { success: true };
  }

  async upsertAnamneze(
    doctorId: string,
    role: string,
    patientId: string,
    dto: UpsertAnamnezeDto,
  ) {
    this.ensureDoctor(role);
    await this.ensureDoctorPatientAccess(doctorId, patientId);
    return this.prisma.anamneze.create({
      data: { doctorId, patientId, content: dto.content },
    });
  }

  async getAnamneze(doctorId: string, role: string, patientId: string) {
    this.ensureDoctor(role);
    await this.ensureDoctorPatientAccess(doctorId, patientId);
    return this.prisma.anamneze.findMany({
      where: { patientId, doctorId },
      orderBy: { updatedAt: 'desc' },
    });
  }

  async updateAnamneze(
    doctorId: string,
    role: string,
    patientId: string,
    anamnezeId: string,
    dto: UpsertAnamnezeDto,
  ) {
    this.ensureDoctor(role);
    await this.ensureDoctorPatientAccess(doctorId, patientId);
    const entry = await this.prisma.anamneze.findUnique({
      where: { id: anamnezeId },
    });
    if (!entry || entry.patientId !== patientId || entry.doctorId !== doctorId) {
      throw new NotFoundException('Anamnesis entry not found');
    }

    return this.prisma.anamneze.update({
      where: { id: anamnezeId },
      data: { content: dto.content },
    });
  }

  async removeAnamneze(
    doctorId: string,
    role: string,
    patientId: string,
    anamnezeId: string,
  ) {
    this.ensureDoctor(role);
    await this.ensureDoctorPatientAccess(doctorId, patientId);
    const entry = await this.prisma.anamneze.findUnique({
      where: { id: anamnezeId },
    });
    if (!entry || entry.patientId !== patientId || entry.doctorId !== doctorId) {
      throw new NotFoundException('Anamneze entry not found');
    }

    await this.prisma.anamneze.delete({ where: { id: anamnezeId } });
    return { success: true };
  }

  async submitClockTest(patientId: string, dto: CreateClockTestDto) {
    const startedAt = Date.now();
    await this.ensurePatientExists(patientId);

    const imageUrl = dto.imageUrl?.trim();
    if (!imageUrl) {
      throw new BadRequestException('Clock test image is required.');
    }

    let mimeType = 'unknown';
    let approxBytes = imageUrl.length;
    const isDataUrl = imageUrl.startsWith('data:image/');
    if (isDataUrl) {
      const commaIndex = imageUrl.indexOf(',');
      const header = commaIndex > -1 ? imageUrl.slice(0, commaIndex) : '';
      const payload = commaIndex > -1 ? imageUrl.slice(commaIndex + 1) : '';
      const mimeMatch = header.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64$/);
      if (mimeMatch?.[1]) mimeType = mimeMatch[1];
      approxBytes = Math.floor((payload.length * 3) / 4);

      // Prevent oversized JSON payloads from stalling request handling.
      if (approxBytes > 2_500_000) {
        throw new BadRequestException(
          'Clock test image is too large. Please retry with a smaller image.',
        );
      }
    }

    this.logger.log(
      `Clock submit start patient=${patientId} dataUrl=${isDataUrl} mime=${mimeType} approxBytes=${approxBytes}`,
    );

    try {
      const test = await this.prisma.clockTest.create({
        data: {
          patientId,
          imageUrl,
          metadata: dto.metadata as Prisma.InputJsonValue | undefined,
        },
      });

      const doctors = await this.prisma.doctorPatient.findMany({
        where: { patientId, status: DoctorPatientStatus.ACTIVE },
        select: { doctorId: true },
      });
      await Promise.all(
        doctors.map((d) =>
          this.createNotification({
            userId: d.doctorId,
            patientId,
            type: 'CLOCK_TEST_COMPLETED',
            title: 'Clock test completed',
            body: 'A patient has completed the clock drawing test.',
            metadata: { clockTestId: test.id },
          }),
        ),
      );

      this.logger.log(
        `Clock submit success patient=${patientId} clockTestId=${test.id} elapsedMs=${Date.now() - startedAt}`,
      );
      return test;
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : 'Unknown clock submit error';
      this.logger.error(
        `Clock submit failed patient=${patientId} elapsedMs=${Date.now() - startedAt} error=${message}`,
      );
      throw error;
    }
  }

  async submitMmseTest(patientId: string, dto: CreateMmseTestDto) {
    await this.ensurePatientExists(patientId);
    const score = this.extractMmseScore(dto.answers);
    const mmse = await this.prisma.mMSETest.create({
      data: {
        patientId,
        score,
        answers: dto.answers as Prisma.InputJsonValue,
        assignedByDoctor: dto.assignedByDoctor || null,
      },
    });

    const previous = await this.prisma.mMSETest.findFirst({
      where: { patientId, id: { not: mmse.id } },
      orderBy: { createdAt: 'desc' },
    });
    const scoreDrop =
      typeof previous?.score === 'number' ? previous.score - mmse.score : 0;

    const doctors = await this.prisma.doctorPatient.findMany({
      where: { patientId, status: DoctorPatientStatus.ACTIVE },
      select: { doctorId: true },
    });

    await Promise.all(
      doctors.map((d) =>
        this.createNotification({
          userId: d.doctorId,
          patientId,
          type: scoreDrop >= 3 ? 'MMSE_SCORE_DROP_ALERT' : 'MMSE_COMPLETED',
          title: scoreDrop >= 3 ? 'MMSE score drop alert' : 'MMSE completed',
          body:
            scoreDrop >= 3
              ? `MMSE dropped by ${scoreDrop} points. Review patient urgently.`
              : 'Patient completed MMSE test.',
          metadata: { mmseId: mmse.id, score: mmse.score, scoreDrop },
        }),
      ),
    );

    return mmse;
  }

  async assignMmse(doctorId: string, role: string, patientId: string) {
    this.ensureDoctor(role);
    await this.ensureDoctorPatientAccess(doctorId, patientId);
    const patient = await this.prisma.patient.findUnique({
      where: { id: patientId },
      select: { firstName: true, lastName: true },
    });
    const patientName = patient
      ? `${patient.firstName} ${patient.lastName}`.trim()
      : 'patient';
    await this.createNotification({
      patientId,
      type: 'MMSE_ASSIGNED',
      title: 'MMSE assigned',
      body: 'Your doctor assigned a new MMSE test. Please complete it with your caregiver.',
      actorId: doctorId,
      metadata: { patientId, patientName },
    });
    await this.notifyCaregivers(
      patientId,
      `MMSE assigned to ${patientName}`,
      `A doctor assigned an MMSE test. Please help ${patientName} complete it.`,
      'MMSE_ASSIGNED',
      { assignedBy: doctorId, patientId, patientName },
    );
    return { success: true };
  }

  async assignClockTest(doctorId: string, role: string, patientId: string) {
    this.ensureDoctor(role);
    await this.ensureDoctorPatientAccess(doctorId, patientId);
    const patient = await this.prisma.patient.findUnique({
      where: { id: patientId },
      select: { firstName: true, lastName: true },
    });
    const patientName = patient
      ? `${patient.firstName} ${patient.lastName}`.trim()
      : 'patient';
    await this.createNotification({
      patientId,
      type: 'CLOCK_TEST_ASSIGNED',
      title: 'Clock test assigned',
      body: 'Your doctor assigned a new clock drawing test.',
      actorId: doctorId,
      metadata: { patientId, patientName },
    });
    await this.notifyCaregivers(
      patientId,
      `Clock test assigned to ${patientName}`,
      `A doctor assigned a clock drawing test for ${patientName}.`,
      'CLOCK_TEST_ASSIGNED',
      { assignedBy: doctorId, patientId, patientName },
    );
    return { success: true };
  }

  async getPendingTestsForPatient(patientId: string) {
    const now = new Date();
    const days30Ago = new Date(now);
    days30Ago.setDate(days30Ago.getDate() - 30);

    const [latestClock, latestMmse, pendingNotifications] = await Promise.all([
      this.prisma.clockTest.findFirst({
        where: { patientId },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.mMSETest.findFirst({
        where: { patientId },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.appNotification.findMany({
        where: {
          patientId,
          isRead: false,
          type: {
            in: ['MMSE_ASSIGNED', 'CLOCK_TEST_ASSIGNED', 'DOCTOR_ASSIGNED'],
          },
        },
      }),
    ]);

    return {
      clockDue: !latestClock || latestClock.createdAt < days30Ago,
      mmseDue: !latestMmse || latestMmse.createdAt < days30Ago,
      assignedNow: pendingNotifications.map((n) => n.type),
    };
  }

  async createTreatment(
    doctorId: string,
    role: string,
    patientId: string,
    dto: CreateTreatmentDto,
  ) {
    this.ensureDoctor(role);
    await this.ensureDoctorPatientAccess(doctorId, patientId);
    const treatment = await this.prisma.treatment.create({
      data: { doctorId, patientId, description: dto.description },
    });
    await this.createNotification({
      patientId,
      type: 'TREATMENT_ASSIGNED',
      title: 'New treatment assigned',
      body: 'A doctor assigned a new treatment plan.',
      actorId: doctorId,
      metadata: { treatmentId: treatment.id },
    });
    return treatment;
  }

  async getTreatmentsForDoctor(
    doctorId: string,
    role: string,
    patientId: string,
  ) {
    this.ensureDoctor(role);
    await this.ensureDoctorPatientAccess(doctorId, patientId);
    return this.prisma.treatment.findMany({
      where: { patientId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getTreatmentsForPatient(patientId: string) {
    return this.prisma.treatment.findMany({
      where: { patientId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async createDoctorNote(
    doctorId: string,
    role: string,
    patientId: string,
    dto: CreateDoctorNoteDto,
  ) {
    this.ensureDoctor(role);
    await this.ensureDoctorPatientAccess(doctorId, patientId);
    return this.prisma.doctorNote.create({
      data: { patientId, doctorId, content: dto.content },
    });
  }

  async getDoctorNotes(doctorId: string, role: string, patientId: string) {
    this.ensureDoctor(role);
    await this.ensureDoctorPatientAccess(doctorId, patientId);
    return this.prisma.doctorNote.findMany({
      where: { patientId, doctorId },
      orderBy: { updatedAt: 'desc' },
    });
  }

  async getPatientProfileForDoctor(
    doctorId: string,
    role: string,
    patientId: string,
  ) {
    this.ensureDoctor(role);
    await this.ensureDoctorPatientAccess(doctorId, patientId);

    const [patient, latestAnamneze, latestMmse, latestClock, latestTreatment] =
      await Promise.all([
        this.prisma.patient.findUnique({
          where: { id: patientId },
          select: {
            id: true,
            firstName: true,
            lastName: true,
            birthDate: true,
            avatarUrl: true,
            shortIntro: true,
            maritalDate: true,
            updatedAt: true,
          },
        }),
        this.prisma.anamneze.findFirst({
          where: { patientId },
          orderBy: { updatedAt: 'desc' },
        }),
        this.prisma.mMSETest.findFirst({
          where: { patientId },
          orderBy: { createdAt: 'desc' },
        }),
        this.prisma.clockTest.findFirst({
          where: { patientId },
          orderBy: { createdAt: 'desc' },
        }),
        this.prisma.treatment.findFirst({
          where: { patientId },
          orderBy: { createdAt: 'desc' },
        }),
      ]);

    return {
      patient,
      latestAnamneze,
      latestMmse,
      latestClock,
      latestTreatment,
    };
  }

  async getNotifications(userId: string, role: string) {
    if (role === Role.PATIENT) {
      return this.prisma.appNotification.findMany({
        where: { patientId: userId },
        orderBy: { createdAt: 'desc' },
        take: 100,
      });
    }

    return this.prisma.appNotification.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  async markNotificationRead(
    userId: string,
    role: string,
    notificationId: string,
  ) {
    const notification = await this.prisma.appNotification.findUnique({
      where: { id: notificationId },
    });
    if (!notification) throw new NotFoundException('Notification not found');

    const allowed =
      role === Role.PATIENT
        ? notification.patientId === userId
        : notification.userId === userId;
    if (!allowed)
      throw new ForbiddenException('No access to this notification');

    return this.prisma.appNotification.update({
      where: { id: notificationId },
      data: { isRead: true },
    });
  }

  async getMmseAnalytics(doctorId: string, role: string, patientId: string) {
    this.ensureDoctor(role);
    await this.ensureDoctorPatientAccess(doctorId, patientId);
    return this.prisma.mMSETest.findMany({
      where: { patientId },
      select: { id: true, score: true, createdAt: true },
      orderBy: { createdAt: 'asc' },
    });
  }

  async getClockGallery(doctorId: string, role: string, patientId: string) {
    this.ensureDoctor(role);
    await this.ensureDoctorPatientAccess(doctorId, patientId);
    return this.prisma.clockTest.findMany({
      where: { patientId },
      orderBy: { createdAt: 'desc' },
    });
  }

  /** Caregiver read-only access: ensure the user is linked to the patient. */
  private async ensureCaregiverAccess(userId: string, patientId: string) {
    const link = await this.prisma.patientCaregiver.findUnique({
      where: { patientId_caregiverId: { patientId, caregiverId: userId } },
    });
    if (!link) throw new ForbiddenException('No access to this patient');
  }

  /** Caregiver read-only MMSE history. */
  async getMmseHistoryForCaregiver(
    caregiverId: string,
    patientId: string,
  ) {
    await this.ensureCaregiverAccess(caregiverId, patientId);
    return this.prisma.mMSETest.findMany({
      where: { patientId },
      select: { id: true, score: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  /** Caregiver read-only clock test history. */
  async getClockHistoryForCaregiver(
    caregiverId: string,
    patientId: string,
  ) {
    await this.ensureCaregiverAccess(caregiverId, patientId);
    return this.prisma.clockTest.findMany({
      where: { patientId },
      select: {
        id: true,
        createdAt: true,
        imageUrl: true,
        metadata: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async rateClockTest(
    doctorId: string,
    role: string,
    patientId: string,
    clockTestId: string,
    dto: RateClockTestDto,
  ) {
    this.ensureDoctor(role);
    await this.ensureDoctorPatientAccess(doctorId, patientId);

    const clock = await this.prisma.clockTest.findUnique({ where: { id: clockTestId } });
    if (!clock || clock.patientId !== patientId) {
      throw new NotFoundException('Clock test not found');
    }

    const currentMetadata =
      clock.metadata && typeof clock.metadata === 'object'
        ? (clock.metadata as Record<string, unknown>)
        : {};
    const nextMetadata: Record<string, unknown> = {
      ...currentMetadata,
      rating: dto.rating,
      ratingNote: dto.note || null,
      ratedAt: new Date().toISOString(),
      ratedByDoctorId: doctorId,
    };

    const updated = await this.prisma.clockTest.update({
      where: { id: clockTestId },
      data: { metadata: nextMetadata as Prisma.InputJsonValue },
    });

    await this.createNotification({
      patientId,
      type: 'CLOCK_TEST_RATED',
      title: 'Clock test reviewed',
      body: `Your doctor reviewed your clock drawing test (rating ${dto.rating}/5).`,
      actorId: doctorId,
      metadata: { clockTestId: updated.id, rating: dto.rating },
    });

    return updated;
  }

  async getTimeline(doctorId: string, role: string, patientId: string) {
    this.ensureDoctor(role);
    await this.ensureDoctorPatientAccess(doctorId, patientId);

    const [anamneze, mmse, clock, treatments] = await Promise.all([
      this.prisma.anamneze.findMany({
        where: { patientId },
        select: { id: true, updatedAt: true, content: true },
      }),
      this.prisma.mMSETest.findMany({
        where: { patientId },
        select: { id: true, createdAt: true, score: true },
      }),
      this.prisma.clockTest.findMany({
        where: { patientId },
        select: { id: true, createdAt: true },
      }),
      this.prisma.treatment.findMany({
        where: { patientId },
        select: { id: true, createdAt: true, description: true },
      }),
    ]);

    const timeline = [
      ...anamneze.map((a) => ({
        type: 'ANAMNEZE_UPDATED',
        at: a.updatedAt,
        payload: { id: a.id, content: a.content },
      })),
      ...mmse.map((m) => ({
        type: 'MMSE_COMPLETED',
        at: m.createdAt,
        payload: { id: m.id, score: m.score },
      })),
      ...clock.map((c) => ({
        type: 'CLOCK_TEST_COMPLETED',
        at: c.createdAt,
        payload: { id: c.id },
      })),
      ...treatments.map((t) => ({
        type: 'TREATMENT_ASSIGNED',
        at: t.createdAt,
        payload: { id: t.id, description: t.description },
      })),
    ].sort((a, b) => +new Date(b.at) - +new Date(a.at));

    return timeline;
  }

  async generateAiRecommendation(
    doctorId: string,
    role: string,
    patientId: string,
    dto: CreateAiRecommendationDto,
  ) {
    this.ensureDoctor(role);
    await this.ensureDoctorPatientAccess(doctorId, patientId);

    const geminiApiKey = this.config.get<string>('GEMINI_API_KEY');
    if (!geminiApiKey) {
      throw new BadRequestException('GEMINI_API_KEY is not configured');
    }

    const [anamneze, mmse, clock] = await Promise.all([
      this.prisma.anamneze.findMany({
        where: { patientId },
        orderBy: { updatedAt: 'desc' },
        take: 3,
      }),
      this.prisma.mMSETest.findMany({
        where: { patientId },
        orderBy: { createdAt: 'desc' },
        take: 6,
      }),
      this.prisma.clockTest.findMany({
        where: { patientId },
        orderBy: { createdAt: 'desc' },
        take: 3,
        select: { id: true, createdAt: true, metadata: true },
      }),
    ]);

    const prompt = [
      'You are a clinical assistant writing treatment drafts in LSMU medical doctor standard style.',
      'Use strict evidence-based recommendations aligned with LSMU Alzheimer and dementia clinical guidance.',
      'Output clinical language: assessment summary, rationale, non-pharmacological plan, pharmacological considerations, monitoring plan, contraindication cautions.',
      'Do not produce diagnosis; provide draft recommendations for doctor review only.',
      'When evidence is uncertain, explicitly state uncertainty and propose follow-up diagnostics.',
      `Additional doctor prompt: ${dto.prompt || 'Provide practical next-step recommendations.'}`,
      'Patient context:',
      `- Anamneze: ${anamneze.map((a) => a.content).join(' | ') || 'n/a'}`,
      `- MMSE recent: ${mmse.map((m) => `${m.score} (${m.createdAt.toISOString()})`).join(' | ') || 'n/a'}`,
      `- Clock metadata: ${JSON.stringify(clock)}`,
      'Return a concise, editable treatment plan draft as plain text only.',
      'Do not use markdown, bullet symbols, numbered lists, headings, or separators.',
    ].join('\n');

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiApiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.2, maxOutputTokens: 800 },
        }),
      },
    );

    const data = await response.json();
    const aiText =
      data?.candidates?.[0]?.content?.parts
        ?.map((p: { text?: string }) => p.text || '')
        .join('') || 'No recommendation generated.';

    const plainText = aiText
      .replace(/\*\*(.*?)\*\*/g, '$1')
      .replace(/`([^`]+)`/g, '$1')
      .replace(/^#{1,6}\s*/gm, '')
      .replace(/^\s*[-*]\s+/gm, '')
      .replace(/^\s*\d+\.\s+/gm, '')
      .replace(/^\s*[-_]{3,}\s*$/gm, '')
      .replace(/\n{3,}/g, '\n\n')
      .trim();

    return {
      recommendation: `${plainText}\n\nConsult a neurologist or qualified doctor before applying any treatment.`,
    };
  }

  // ─── Patient Chat ────────────────────────────────────────────────────────

  /** List all rooms linked to this patient (created for their care team). */
  async getPatientRooms(patientId: string) {
    const rooms = await this.prisma.room.findMany({
      where: { patientId },
      orderBy: { updatedAt: 'desc' },
      include: {
        members: {
          include: {
            user: {
              select: { id: true, firstName: true, lastName: true, role: true, avatarUrl: true },
            },
          },
        },
        threads: {
          orderBy: { updatedAt: 'desc' },
          take: 1,
          include: {
            messages: {
              orderBy: { createdAt: 'desc' },
              take: 1,
              include: {
                author: { select: { firstName: true, lastName: true } },
                patientAuthor: { select: { firstName: true, lastName: true } },
              },
            },
          },
        },
      },
    });
    return rooms;
  }

  /** List threads in a patient-linked room. */
  async getPatientRoomThreads(patientId: string, roomId: string) {
    const room = await this.prisma.room.findFirst({ where: { id: roomId, patientId } });
    if (!room) throw new ForbiddenException('Room not accessible for this patient');

    return this.prisma.thread.findMany({
      where: { roomId },
      orderBy: { updatedAt: 'desc' },
      include: {
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          include: {
            author: { select: { firstName: true, lastName: true } },
            patientAuthor: { select: { firstName: true, lastName: true } },
          },
        },
      },
    });
  }

  /** Get paginated messages in a thread (must belong to a patient room). */
  async getPatientThreadMessages(patientId: string, threadId: string, page = 1, pageSize = 50) {
    const thread = await this.prisma.thread.findFirst({
      where: { id: threadId, room: { patientId } },
    });
    if (!thread) throw new ForbiddenException('Thread not accessible for this patient');

    const skip = (page - 1) * pageSize;
    const [items, total] = await Promise.all([
      this.prisma.message.findMany({
        where: { threadId },
        orderBy: { createdAt: 'asc' },
        skip,
        take: pageSize,
        include: {
          author: { select: { id: true, firstName: true, lastName: true, avatarUrl: true, role: true } },
          patientAuthor: { select: { id: true, firstName: true, lastName: true, avatarUrl: true } },
        },
      }),
      this.prisma.message.count({ where: { threadId } }),
    ]);

    return { items, page, pageSize, total };
  }

  /** Patient sends a message; notifies User members via AppNotification (no Expo for them). */
  async sendPatientMessage(patientId: string, threadId: string, content: string) {
    const trimmed = content.trim();
    if (!trimmed) throw new BadRequestException('EMPTY_CONTENT');

    const thread = await this.prisma.thread.findFirst({
      where: { id: threadId, room: { patientId } },
      include: {
        room: {
          include: {
            members: { select: { userId: true } },
          },
        },
      },
    });
    if (!thread) throw new ForbiddenException('Thread not accessible for this patient');

    const message = await this.prisma.message.create({
      data: { threadId, patientAuthorId: patientId, content: trimmed },
      include: {
        patientAuthor: { select: { id: true, firstName: true, lastName: true, avatarUrl: true } },
      },
    });

    // Touch thread + room updatedAt so ordering works
    await Promise.all([
      this.prisma.thread.update({ where: { id: threadId }, data: { updatedAt: new Date() } }),
      this.prisma.room.update({ where: { id: thread.room.id }, data: { updatedAt: new Date() } }),
    ]);

    // Notify User members (doctor, caregiver) via in-app notification
    const patient = await this.prisma.patient.findUnique({
      where: { id: patientId },
      select: { firstName: true, lastName: true },
    });
    const senderName = patient ? `${patient.firstName} ${patient.lastName}` : 'Patient';

    for (const member of thread.room.members) {
      await this.createNotification({
        userId: member.userId,
        title: `New message from ${senderName}`,
        body: trimmed.length > 100 ? `${trimmed.slice(0, 100)}…` : trimmed,
        type: 'CHAT_MESSAGE',
        metadata: { threadId, roomId: thread.room.id },
      });
    }

    return message;
  }

  /**
   * Find or create a dedicated doctor-patient room + thread.
   * Returns the roomId and threadId to navigate to.
   */
  async getOrCreateDoctorThread(patientId: string) {
    const assignment = await this.prisma.doctorPatient.findFirst({
      where: { patientId, status: DoctorPatientStatus.ACTIVE },
      include: {
        doctor: { select: { id: true, firstName: true, lastName: true } },
      },
      orderBy: { assignedAt: 'desc' },
    });
    if (!assignment) throw new NotFoundException('No active doctor assigned to this patient');

    const doctorId = assignment.doctor.id;

    // Check if a room already exists that is linked to this patient and has this doctor as member
    const existingRoom = await this.prisma.room.findFirst({
      where: {
        patientId,
        members: { some: { userId: doctorId } },
      },
      include: { threads: { orderBy: { createdAt: 'asc' }, take: 1 } },
    });

    if (existingRoom) {
      const thread = existingRoom.threads[0];
      if (thread) return { roomId: existingRoom.id, threadId: thread.id };

      // Room exists but no thread — create one
      const newThread = await this.prisma.thread.create({
        data: { roomId: existingRoom.id, title: 'Chat', createdById: doctorId },
      });
      return { roomId: existingRoom.id, threadId: newThread.id };
    }

    // Create fresh room + thread
    const patient = await this.prisma.patient.findUnique({
      where: { id: patientId },
      select: { firstName: true, lastName: true },
    });
    const patientName = patient ? `${patient.firstName} ${patient.lastName}` : 'Patient';

    const room = await this.prisma.room.create({
      data: {
        name: `${patientName} — Dr. ${assignment.doctor.lastName}`,
        visibility: 'PRIVATE',
        createdById: doctorId,
        patientId,
        members: { create: { userId: doctorId, role: 'OWNER' } },
      },
    });

    const thread = await this.prisma.thread.create({
      data: { roomId: room.id, title: 'Chat', createdById: doctorId },
    });

    return { roomId: room.id, threadId: thread.id };
  }

  /**
   * Doctor: find OR create the room+thread shared with a specific patient.
   * Allows doctors to initiate a chat without waiting for the patient to message first.
   */
  async getDoctorPatientChatRoom(doctorId: string, role: string, patientId: string) {
    this.ensureDoctor(role);
    await this.ensureDoctorPatientAccess(doctorId, patientId);

    const existingRoom = await this.prisma.room.findFirst({
      where: {
        patientId,
        members: { some: { userId: doctorId } },
      },
      include: {
        threads: { orderBy: { createdAt: 'asc' }, take: 1 },
      },
    });

    if (existingRoom) {
      const thread = existingRoom.threads[0];
      if (thread) return { roomId: existingRoom.id, threadId: thread.id };

      const newThread = await this.prisma.thread.create({
        data: {
          roomId: existingRoom.id,
          title: 'Chat',
          createdById: doctorId,
        },
      });
      return { roomId: existingRoom.id, threadId: newThread.id };
    }

    const [doctor, patient] = await Promise.all([
      this.prisma.user.findUnique({
        where: { id: doctorId },
        select: { firstName: true, lastName: true },
      }),
      this.prisma.patient.findUnique({
        where: { id: patientId },
        select: { firstName: true, lastName: true },
      }),
    ]);
    const patientName = patient
      ? `${patient.firstName} ${patient.lastName}`
      : 'Patient';
    const doctorLastName = doctor?.lastName ?? 'Doctor';

    const room = await this.prisma.room.create({
      data: {
        name: `${patientName} — Dr. ${doctorLastName}`,
        visibility: 'PRIVATE',
        createdById: doctorId,
        patientId,
        members: { create: { userId: doctorId, role: 'OWNER' } },
      },
    });
    const thread = await this.prisma.thread.create({
      data: { roomId: room.id, title: 'Chat', createdById: doctorId },
    });
    return { roomId: room.id, threadId: thread.id };
  }

  /** Returns the active assigned doctor for a patient, or null if none. */
  async getMyDoctor(patientId: string) {
    const assignment = await this.prisma.doctorPatient.findFirst({
      where: {
        patientId,
        status: DoctorPatientStatus.ACTIVE,
      },
      orderBy: { assignedAt: 'desc' },
      select: {
        assignedAt: true,
        doctor: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            phone: true,
            avatarUrl: true,
            profession: true,
            title: true,
            workplace: true,
          },
        },
      },
    });

    if (!assignment) return null;

    return {
      assignedAt: assignment.assignedAt,
      ...assignment.doctor,
    };
  }
}
