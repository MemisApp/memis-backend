import { ForbiddenException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { isSameZonedDay } from '../../common/time.util';

@Injectable()
export class CheckInService {
  private readonly timezone: string;

  constructor(
    private readonly prisma: PrismaService,
    config: ConfigService,
  ) {
    this.timezone = config.get<string>('APP_TIMEZONE') || 'Europe/Vilnius';
  }

  private async ensureCaregiverAccess(caregiverId: string, patientId: string) {
    const link = await this.prisma.patientCaregiver.findUnique({
      where: { patientId_caregiverId: { patientId, caregiverId } },
    });
    if (!link) throw new ForbiddenException('No access to this patient');
  }

  /** Patient taps "I'm OK" — records the check-in and clears any missed flag. */
  async submit(patientId: string) {
    const now = new Date();
    await this.prisma.checkIn.create({ data: { patientId, status: 'OK' } });
    await this.prisma.patientCareSettings.upsert({
      where: { patientId },
      create: { patientId, lastCheckInAt: now, lastMissedCheckInAlertAt: null },
      update: { lastCheckInAt: now, lastMissedCheckInAlertAt: null },
    });
    return this.status(patientId);
  }

  /** Patient-facing status: whether a check-in is expected and if it's done. */
  async status(patientId: string) {
    const settings = await this.prisma.patientCareSettings.findUnique({
      where: { patientId },
    });
    const checkedInToday =
      !!settings?.lastCheckInAt &&
      isSameZonedDay(settings.lastCheckInAt, new Date(), this.timezone);
    return {
      enabled: settings?.checkInEnabled ?? false,
      checkInByHour: settings?.checkInByHour ?? 20,
      checkedInToday,
      lastCheckInAt: settings?.lastCheckInAt ?? null,
    };
  }

  /** Caregiver view of recent check-ins. */
  async history(caregiverId: string, patientId: string, limit = 14) {
    await this.ensureCaregiverAccess(caregiverId, patientId);
    return this.prisma.checkIn.findMany({
      where: { patientId },
      orderBy: { createdAt: 'desc' },
      take: Math.max(1, Math.min(60, limit)),
    });
  }
}
