import { ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { UpdateCareSettingsDto } from './dto/update-care-settings.dto';

const SETTINGS_SELECT = {
  checkInEnabled: true,
  checkInByHour: true,
  cognitiveMonitoringEnabled: true,
  digestFrequency: true,
  lastCheckInAt: true,
  lastLocationAt: true,
} as const;

@Injectable()
export class CareSettingsService {
  constructor(private readonly prisma: PrismaService) {}

  private async ensureCaregiverAccess(caregiverId: string, patientId: string) {
    const link = await this.prisma.patientCaregiver.findUnique({
      where: { patientId_caregiverId: { patientId, caregiverId } },
    });
    if (!link) throw new ForbiddenException('No access to this patient');
  }

  async get(caregiverId: string, patientId: string) {
    await this.ensureCaregiverAccess(caregiverId, patientId);
    const settings = await this.prisma.patientCareSettings.upsert({
      where: { patientId },
      create: { patientId },
      update: {},
      select: SETTINGS_SELECT,
    });
    return settings;
  }

  async update(
    caregiverId: string,
    patientId: string,
    dto: UpdateCareSettingsDto,
  ) {
    await this.ensureCaregiverAccess(caregiverId, patientId);
    return this.prisma.patientCareSettings.upsert({
      where: { patientId },
      create: {
        patientId,
        checkInEnabled: dto.checkInEnabled ?? false,
        checkInByHour: dto.checkInByHour ?? 20,
        cognitiveMonitoringEnabled: dto.cognitiveMonitoringEnabled ?? false,
        digestFrequency: dto.digestFrequency ?? 'OFF',
      },
      update: {
        checkInEnabled: dto.checkInEnabled ?? undefined,
        checkInByHour: dto.checkInByHour ?? undefined,
        cognitiveMonitoringEnabled: dto.cognitiveMonitoringEnabled ?? undefined,
        digestFrequency: dto.digestFrequency ?? undefined,
      },
      select: SETTINGS_SELECT,
    });
  }
}
