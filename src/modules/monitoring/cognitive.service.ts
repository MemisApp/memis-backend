import { ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

// A drop of this many MMSE points vs the previous test is flagged as a possible
// decline (≈ clinically meaningful annualised change).
export const MMSE_DECLINE_THRESHOLD = 3;

export interface CognitiveReport {
  tests: { id: string; score: number; createdAt: Date }[];
  latestScore: number | null;
  previousScore: number | null;
  change: number | null;
  trend: 'improving' | 'stable' | 'declining' | 'insufficient';
  clockTestCount: number;
  lastTestAt: Date | null;
  interpretation: string;
}

@Injectable()
export class CognitiveService {
  constructor(private readonly prisma: PrismaService) {}

  private async ensureCaregiverAccess(caregiverId: string, patientId: string) {
    const link = await this.prisma.patientCaregiver.findUnique({
      where: { patientId_caregiverId: { patientId, caregiverId } },
    });
    if (!link) throw new ForbiddenException('No access to this patient');
  }

  private interpret(
    trend: CognitiveReport['trend'],
    latest: number | null,
  ): string {
    if (trend === 'insufficient') {
      return 'Not enough tests yet to show a trend. Aim for a memory check each month.';
    }
    const severity =
      latest === null
        ? ''
        : latest >= 24
          ? ' Scores are in the normal-to-mild range.'
          : latest >= 18
            ? ' Scores suggest mild impairment.'
            : ' Scores suggest moderate-to-severe impairment.';
    if (trend === 'declining') {
      return `Recent scores are trending down — consider discussing with their doctor.${severity}`;
    }
    if (trend === 'improving') {
      return `Recent scores are trending up.${severity}`;
    }
    return `Scores are holding steady.${severity}`;
  }

  /** Full cognitive report for the caregiver UI (and monthly summary). */
  async getReport(
    caregiverId: string,
    patientId: string,
  ): Promise<CognitiveReport> {
    await this.ensureCaregiverAccess(caregiverId, patientId);
    return this.buildReport(patientId);
  }

  async buildReport(patientId: string): Promise<CognitiveReport> {
    const [tests, clockTestCount] = await Promise.all([
      this.prisma.mMSETest.findMany({
        where: { patientId },
        orderBy: { createdAt: 'asc' },
        select: { id: true, score: true, createdAt: true },
      }),
      this.prisma.clockTest.count({ where: { patientId } }),
    ]);

    const latest = tests.length ? tests[tests.length - 1] : null;
    const previous = tests.length >= 2 ? tests[tests.length - 2] : null;
    const change =
      latest && previous ? latest.score - previous.score : null;

    let trend: CognitiveReport['trend'] = 'insufficient';
    if (latest && previous && change !== null) {
      if (change <= -MMSE_DECLINE_THRESHOLD) trend = 'declining';
      else if (change >= MMSE_DECLINE_THRESHOLD) trend = 'improving';
      else trend = 'stable';
    }

    return {
      tests,
      latestScore: latest?.score ?? null,
      previousScore: previous?.score ?? null,
      change,
      trend,
      clockTestCount,
      lastTestAt: latest?.createdAt ?? null,
      interpretation: this.interpret(trend, latest?.score ?? null),
    };
  }
}
