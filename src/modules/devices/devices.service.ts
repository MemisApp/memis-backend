import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { UpdateDeviceDto } from './dto/update-device.dto';

@Injectable()
export class DevicesService {
  constructor(private prisma: PrismaService) {}

  async findByPatient(patientId: string, userId: string) {
    // Check if user has access to this patient
    const hasAccess = await this.hasPatientAccess(userId, patientId);
    if (!hasAccess) {
      throw new ForbiddenException('No access to this patient');
    }

    const devices = await this.prisma.device.findMany({
      where: { patientId },
      select: {
        id: true,
        platform: true,
        devicePublicId: true,
        deviceName: true,
        isPrimary: true,
        lastSeenAt: true,
        createdAt: true,
      },
      orderBy: [
        { isPrimary: 'desc' }, // Primary devices first
        { lastSeenAt: 'desc' }, // Then by last seen
        { createdAt: 'desc' }, // Then by creation date
      ],
    });

    return devices;
  }

  async update(deviceId: string, userId: string, dto: UpdateDeviceDto) {
    // Get device and check access
    const device = await this.prisma.device.findUnique({
      where: { id: deviceId },
      include: { patient: true },
    });

    if (!device) {
      throw new NotFoundException('Device not found');
    }

    const hasAccess = await this.hasPatientAccess(userId, device.patientId);
    if (!hasAccess) {
      throw new ForbiddenException('No access to this device');
    }

    // If setting as primary, unset other primary devices for this patient
    if (dto.isPrimary === true) {
      await this.prisma.device.updateMany({
        where: {
          patientId: device.patientId,
          id: { not: deviceId },
        },
        data: { isPrimary: false },
      });
    }

    const updatedDevice = await this.prisma.device.update({
      where: { id: deviceId },
      data: {
        ...(dto.deviceName !== undefined && { deviceName: dto.deviceName }),
        ...(dto.isPrimary !== undefined && { isPrimary: dto.isPrimary }),
      },
      select: {
        id: true,
        platform: true,
        devicePublicId: true,
        deviceName: true,
        isPrimary: true,
        lastSeenAt: true,
        createdAt: true,
      },
    });

    return updatedDevice;
  }

  async remove(deviceId: string, userId: string) {
    // Get device and check access
    const device = await this.prisma.device.findUnique({
      where: { id: deviceId },
      include: { patient: true },
    });

    if (!device) {
      throw new NotFoundException('Device not found');
    }

    const hasAccess = await this.hasPatientAccess(userId, device.patientId);
    if (!hasAccess) {
      throw new ForbiddenException('No access to this device');
    }

    await this.prisma.device.delete({
      where: { id: deviceId },
    });

    return { success: true };
  }

  private async hasPatientAccess(userId: string, patientId: string): Promise<boolean> {
    const relation = await this.prisma.patientCaregiver.findUnique({
      where: {
        patientId_caregiverId: {
          patientId,
          caregiverId: userId,
        },
      },
    });

    return !!relation;
  }
}
