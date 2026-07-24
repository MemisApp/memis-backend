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

    if (input.patientId && !input.userId) {
      this.pushService
        .sendToPatient(input.patientId, input.title, input.body, data)
        .catch((err) => this.logger.error('Patient push failed', err));
    }

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

      // Background AI (Gemini) analysis of the drawing — the submission never
      // waits on it and never fails because of it.
      void this.analyzeClockTestWithAi(test.id, patientId, imageUrl, dto.metadata).catch(
        (e: unknown) =>
          this.logger.warn(
            `Clock AI analysis failed for ${test.id}: ${e instanceof Error ? e.message : e}`,
          ),
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

  /**
   * Analyzes a submitted clock drawing with Gemini vision and stores the
   * result on the test record (metadata.aiAnalysis) so caregivers can review
   * a structured, clinically-framed assessment. Informational only — clearly
   * marked as not a diagnosis. Requires a raster (PNG/JPEG/WebP) data URL;
   * legacy SVG submissions are skipped.
   */
  private async analyzeClockTestWithAi(
    clockTestId: string,
    patientId: string,
    imageUrl: string,
    submitMetadata?: Record<string, unknown>,
  ) {
    const geminiApiKey = this.config.get<string>('GEMINI_API_KEY');
    if (!geminiApiKey) return;

    const match = imageUrl.match(
      /^data:(image\/(?:png|jpeg|jpg|webp));base64,(.+)$/,
    );
    if (!match) {
      this.logger.log(
        `Clock AI analysis skipped for ${clockTestId}: not a base64 raster image`,
      );
      return;
    }
    const [, mimeType, base64Data] = match;
    const targetTime =
      typeof submitMetadata?.targetTime === 'string'
        ? submitMetadata.targetTime
        : null;

    const priorScores = await this.getPriorClockScores(patientId, clockTestId);
    const historyLine =
      priorScores.length > 0
        ? `Previous Shulman scores for this patient (most recent first): ${priorScores
            .map((p) => `${p.score}/5 on ${p.date}`)
            .join('; ')}. Compare this new drawing against them to judge whether the patient is improving, stable, or declining.`
        : 'There are no previous scored drawings for this patient, so report the trend as "stable" (no history yet).';

    const prompt = [
      'You are a clinical assistant helping dementia caregivers interpret a Clock Drawing Test (CDT).',
      `The patient was asked to draw an analog clock face${targetTime ? ` showing the time ${targetTime}` : ''}. The dashed circle, if visible, is a printed guide — only the hand-drawn strokes are the patient's work.`,
      'Assess the drawing using the Shulman scoring system (0–5, where 5 = perfect clock, 0 = no reasonable attempt):',
      '5: perfect clock; 4: minor visuospatial errors; 3: inaccurate time with intact visuospatial organisation; 2: moderate disorganisation; 1: severe disorganisation; 0: unable / no representation of a clock.',
      historyLine,
      'Respond with STRICT JSON only, no markdown fences, matching exactly this shape:',
      '{"score": <integer 0-5>, "summary": "<2-3 sentence plain-language summary for a family caregiver>", "observations": ["<specific things done well or poorly: circle, number placement, hand placement, time accuracy>"], "concerns": ["<possible cognitive-domain concerns, phrased cautiously, empty array if none>"], "recommendation": "<one gentle next-step suggestion for the caregiver>", "trend": "<one of: improving | stable | declining>", "trendNote": "<1 sentence explaining the trend vs previous scores; if no history, say this is the first recorded drawing>"}',
      'Rules: be factual about what is visible; never diagnose; use warm, non-alarming language; if the drawing is empty or uninterpretable, score it 0 and say so kindly.',
    ].join('\n');

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiApiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [
            {
              role: 'user',
              parts: [
                { inline_data: { mime_type: mimeType, data: base64Data } },
                { text: prompt },
              ],
            },
          ],
          generationConfig: {
            temperature: 0.2,
            maxOutputTokens: 700,
            responseMimeType: 'application/json',
          },
        }),
      },
    );
    if (!response.ok) {
      throw new Error(`Gemini error ${response.status}: ${await response.text()}`);
    }

    const data = (await response.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    const rawText =
      data?.candidates?.[0]?.content?.parts
        ?.map((p) => p.text || '')
        .join('') || '';
    const jsonText = rawText.replace(/^```(?:json)?/m, '').replace(/```\s*$/m, '').trim();

    let parsed: {
      score?: number;
      summary?: string;
      observations?: string[];
      concerns?: string[];
      recommendation?: string;
      trend?: string;
      trendNote?: string;
    };
    try {
      parsed = JSON.parse(jsonText);
    } catch {
      throw new Error(`Unparseable Gemini analysis: ${rawText.slice(0, 200)}`);
    }

    const score =
      typeof parsed.score === 'number'
        ? Math.max(0, Math.min(5, Math.round(parsed.score)))
        : null;
    const aiAnalysis = {
      score,
      maxScore: 5,
      scale: 'Shulman',
      summary: typeof parsed.summary === 'string' ? parsed.summary : '',
      observations: Array.isArray(parsed.observations)
        ? parsed.observations.filter((o) => typeof o === 'string').slice(0, 8)
        : [],
      concerns: Array.isArray(parsed.concerns)
        ? parsed.concerns.filter((c) => typeof c === 'string').slice(0, 6)
        : [],
      recommendation:
        typeof parsed.recommendation === 'string' ? parsed.recommendation : '',
      trend: this.normalizeTrend(parsed.trend),
      trendNote: typeof parsed.trendNote === 'string' ? parsed.trendNote : '',
      model: 'gemini-2.5-flash',
      analyzedAt: new Date().toISOString(),
    };

    // Re-read + merge so we never clobber a doctor rating written meanwhile.
    const current = await this.prisma.clockTest.findUnique({
      where: { id: clockTestId },
      select: { metadata: true },
    });
    const currentMetadata =
      current?.metadata && typeof current.metadata === 'object'
        ? (current.metadata as Record<string, unknown>)
        : {};
    await this.prisma.clockTest.update({
      where: { id: clockTestId },
      data: {
        metadata: { ...currentMetadata, aiAnalysis } as Prisma.InputJsonValue,
      },
    });
    this.logger.log(
      `Clock AI analysis stored for ${clockTestId} (score ${score ?? 'n/a'}/5)`,
    );

    // Let the care circle know the reviewed result is ready.
    const caregivers = await this.prisma.patientCaregiver.findMany({
      where: { patientId },
      select: { caregiverId: true },
    });
    await Promise.all(
      caregivers.map((c) =>
        this.createNotification({
          userId: c.caregiverId,
          patientId,
          type: 'CLOCK_TEST_ANALYZED',
          title: 'Clock drawing analyzed',
          body: `AI review of the latest clock drawing is ready${score !== null ? ` (score ${score}/5)` : ''}. Open Test History to see it.`,
          metadata: { clockTestId, aiScore: score },
        }),
      ),
    );
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

    await this.notifyCaregivers(
      patientId,
      scoreDrop >= 3 ? 'Cognitive decline alert' : 'MMSE completed',
      scoreDrop >= 3
        ? `The latest MMSE dropped by ${scoreDrop} points (now ${mmse.score}/30). Consider contacting the doctor.`
        : `MMSE completed with a score of ${mmse.score}/30.`,
      scoreDrop >= 3 ? 'MMSE_SCORE_DROP_ALERT' : 'MMSE_COMPLETED',
      { mmseId: mmse.id, score: mmse.score, scoreDrop },
    );

    void this.analyzeMmseWithAi(mmse.id, patientId).catch((e: unknown) =>
      this.logger.warn(
        `MMSE AI analysis failed for ${mmse.id}: ${e instanceof Error ? e.message : e}`,
      ),
    );

    return mmse;
  }

  private normalizeTrend(value: unknown): 'improving' | 'stable' | 'declining' {
    const v = typeof value === 'string' ? value.trim().toLowerCase() : '';
    if (v === 'improving' || v === 'declining') return v;
    return 'stable';
  }

  private async getPriorClockScores(
    patientId: string,
    excludeClockTestId: string,
  ): Promise<{ score: number; date: string }[]> {
    const prior = await this.prisma.clockTest.findMany({
      where: { patientId, id: { not: excludeClockTestId } },
      select: { metadata: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
      take: 5,
    });
    const out: { score: number; date: string }[] = [];
    for (const t of prior) {
      const meta =
        t.metadata && typeof t.metadata === 'object'
          ? (t.metadata as Record<string, unknown>)
          : {};
      const analysis =
        meta.aiAnalysis && typeof meta.aiAnalysis === 'object'
          ? (meta.aiAnalysis as Record<string, unknown>)
          : {};
      if (typeof analysis.score === 'number') {
        out.push({
          score: analysis.score,
          date: new Date(t.createdAt).toLocaleDateString(),
        });
      }
    }
    return out;
  }

  private async analyzeMmseWithAi(mmseId: string, patientId: string) {
    const geminiApiKey = this.config.get<string>('GEMINI_API_KEY');
    if (!geminiApiKey) return;

    const current = await this.prisma.mMSETest.findUnique({
      where: { id: mmseId },
      select: { score: true, createdAt: true },
    });
    if (!current) return;

    const history = await this.prisma.mMSETest.findMany({
      where: { patientId, id: { not: mmseId } },
      select: { score: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
      take: 6,
    });
    const historyLine =
      history.length > 0
        ? `Previous MMSE scores (most recent first): ${history
            .map(
              (h) =>
                `${h.score}/30 on ${new Date(h.createdAt).toLocaleDateString()}`,
            )
            .join('; ')}.`
        : 'There are no previous MMSE scores for this patient (this is the first).';

    const prompt = [
      'You are a clinical assistant helping dementia caregivers interpret a Mini-Mental State Examination (MMSE) result.',
      'The MMSE is scored 0-30 (higher is better); 24-30 normal, 18-23 mild impairment, 10-17 moderate, below 10 severe.',
      `The patient just scored ${current.score}/30.`,
      historyLine,
      'Judge whether the patient is improving, stable, or declining versus the previous scores.',
      'Respond with STRICT JSON only, no markdown fences, matching exactly this shape:',
      '{"summary": "<2-3 sentence plain-language summary of what this score means for a family caregiver>", "trend": "<one of: improving | stable | declining>", "trendNote": "<1 sentence comparing to previous scores; if none, say this is the first recorded test>", "concerns": ["<possible cognitive-domain concerns, phrased cautiously, empty array if none>"], "recommendation": "<one gentle next-step suggestion for the caregiver>"}',
      'Rules: never diagnose; use warm, non-alarming language; a single score is only a snapshot.',
    ].join('\n');

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiApiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.2,
            maxOutputTokens: 700,
            responseMimeType: 'application/json',
          },
        }),
      },
    );
    if (!response.ok) {
      throw new Error(
        `Gemini error ${response.status}: ${await response.text()}`,
      );
    }

    const data = (await response.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    const rawText =
      data?.candidates?.[0]?.content?.parts
        ?.map((p) => p.text || '')
        .join('') || '';
    const jsonText = rawText
      .replace(/^```(?:json)?/m, '')
      .replace(/```\s*$/m, '')
      .trim();

    let parsed: {
      summary?: string;
      trend?: string;
      trendNote?: string;
      concerns?: string[];
      recommendation?: string;
    };
    try {
      parsed = JSON.parse(jsonText);
    } catch {
      throw new Error(`Unparseable Gemini analysis: ${rawText.slice(0, 200)}`);
    }

    const aiAssessment = {
      score: current.score,
      maxScore: 30,
      summary: typeof parsed.summary === 'string' ? parsed.summary : '',
      trend: this.normalizeTrend(parsed.trend),
      trendNote: typeof parsed.trendNote === 'string' ? parsed.trendNote : '',
      concerns: Array.isArray(parsed.concerns)
        ? parsed.concerns.filter((c) => typeof c === 'string').slice(0, 6)
        : [],
      recommendation:
        typeof parsed.recommendation === 'string' ? parsed.recommendation : '',
      model: 'gemini-2.5-flash',
      analyzedAt: new Date().toISOString(),
    };

    await this.prisma.mMSETest.update({
      where: { id: mmseId },
      data: { aiAssessment: aiAssessment as Prisma.InputJsonValue },
    });
    this.logger.log(`MMSE AI assessment stored for ${mmseId}`);

    await this.notifyCaregivers(
      patientId,
      'MMSE assessment ready',
      `AI review of the latest MMSE (${current.score}/30) is ready. Open Test History to see it.`,
      'MMSE_TEST_ANALYZED',
      { mmseId, score: current.score, trend: aiAssessment.trend },
    );
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
      select: { id: true, score: true, createdAt: true, answers: true },
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
      // Return stored answers so caregivers can see the question-by-question
      // breakdown (also used by the PDF doctor-visit report).
      select: {
        id: true,
        score: true,
        createdAt: true,
        answers: true,
        aiAssessment: true,
      },
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

  /** Caregiver read-only treatment plans for a linked patient. */
  async getTreatmentsForCaregiver(caregiverId: string, patientId: string) {
    await this.ensureCaregiverAccess(caregiverId, patientId);
    return this.prisma.treatment.findMany({
      where: { patientId },
      orderBy: { createdAt: 'desc' },
    });
  }

  /** Caregiver read-only doctor notes for a linked patient. */
  async getDoctorNotesForCaregiver(caregiverId: string, patientId: string) {
    await this.ensureCaregiverAccess(caregiverId, patientId);
    return this.prisma.doctorNote.findMany({
      where: { patientId },
      orderBy: { updatedAt: 'desc' },
    });
  }

  /** Caregiver read-only clinical timeline (reuses the doctor timeline shape). */
  async getTimelineForCaregiver(caregiverId: string, patientId: string) {
    await this.ensureCaregiverAccess(caregiverId, patientId);
    return this.buildTimeline(patientId);
  }

  /** Patient reads their own treatment plans. */
  async getMyTreatments(patientId: string) {
    return this.prisma.treatment.findMany({
      where: { patientId },
      orderBy: { createdAt: 'desc' },
    });
  }

  private async buildTimeline(patientId: string) {
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

    return [
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
  }

  /** Patient reads their own MMSE history (with answers). */
  async getMyMmseHistory(patientId: string) {
    return this.prisma.mMSETest.findMany({
      where: { patientId },
      select: {
        id: true,
        score: true,
        createdAt: true,
        answers: true,
        aiAssessment: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /** Patient reads their own clock test history. */
  async getMyClockHistory(patientId: string) {
    return this.prisma.clockTest.findMany({
      where: { patientId },
      select: { id: true, createdAt: true, imageUrl: true, metadata: true },
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
    return this.buildTimeline(patientId);
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

    await Promise.all([
      this.prisma.thread.update({ where: { id: threadId }, data: { updatedAt: new Date() } }),
      this.prisma.room.update({ where: { id: thread.room.id }, data: { updatedAt: new Date() } }),
    ]);

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

      const newThread = await this.prisma.thread.create({
        data: { roomId: existingRoom.id, title: 'Chat', createdById: doctorId },
      });
      return { roomId: existingRoom.id, threadId: newThread.id };
    }

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
