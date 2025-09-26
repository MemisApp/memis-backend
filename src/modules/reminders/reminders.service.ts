import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateReminderDto } from './dto/create-reminder.dto';
import { UpdateReminderDto } from './dto/update-reminder.dto';
import { CaregiverRole } from '@prisma/client';

@Injectable()
export class RemindersService {
  constructor(private prisma: PrismaService) {}

  async create(patientId: string, userId: string, dto: CreateReminderDto) {
    // Check if user has edit access to this patient
    const hasEditAccess = await this.hasPatientEditAccess(userId, patientId);
    if (!hasEditAccess) {
      throw new ForbiddenException(
        'Insufficient permissions to create reminders for this patient',
      );
    }

    const reminder = await this.prisma.reminder.create({
      data: {
        patientId,
        type: dto.type,
        title: dto.title,
        notes: dto.notes,
        schedule: dto.schedule,
        isActive: dto.isActive ?? true,
      },
      select: {
        id: true,
        type: true,
        title: true,
        notes: true,
        schedule: true,
        isActive: true,
        completed: true,
        completedAt: true,
        lastFiredAt: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return reminder;
  }

  async findByPatient(patientId: string, userId: string) {
    // Check if user has access to this patient
    const hasAccess = await this.hasPatientAccess(userId, patientId);
    if (!hasAccess) {
      throw new ForbiddenException('No access to this patient');
    }

    const reminders = await this.prisma.reminder.findMany({
      where: { patientId },
      select: {
        id: true,
        type: true,
        title: true,
        notes: true,
        schedule: true,
        isActive: true,
        completed: true,
        completedAt: true,
        lastFiredAt: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: [
        { isActive: 'desc' }, // Active reminders first
        { createdAt: 'desc' },
      ],
    });

    // Process reminders to reset daily completion status
    const processedReminders = reminders.map((reminder) => ({
      ...reminder,
      completed: this.isCompletedToday(reminder.completedAt),
    }));

    return processedReminders;
  }

  async findOne(reminderId: string, userId: string) {
    const reminder = await this.prisma.reminder.findUnique({
      where: { id: reminderId },
      select: {
        id: true,
        patientId: true,
        type: true,
        title: true,
        notes: true,
        schedule: true,
        isActive: true,
        completed: true,
        completedAt: true,
        lastFiredAt: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!reminder) {
      throw new NotFoundException('Reminder not found');
    }

    // Check access to the patient
    const hasAccess = await this.hasPatientAccess(userId, reminder.patientId);
    if (!hasAccess) {
      throw new ForbiddenException('No access to this reminder');
    }

    // Process completion status based on daily reset
    return {
      ...reminder,
      completed: this.isCompletedToday(reminder.completedAt),
    };
  }

  async update(reminderId: string, userId: string, dto: UpdateReminderDto) {
    const reminder = await this.prisma.reminder.findUnique({
      where: { id: reminderId },
      select: { id: true, patientId: true },
    });

    if (!reminder) {
      throw new NotFoundException('Reminder not found');
    }

    // Check edit access to the patient
    const hasEditAccess = await this.hasPatientEditAccess(
      userId,
      reminder.patientId,
    );
    if (!hasEditAccess) {
      throw new ForbiddenException(
        'Insufficient permissions to edit this reminder',
      );
    }

    const updatedReminder = await this.prisma.reminder.update({
      where: { id: reminderId },
      data: {
        ...(dto.type && { type: dto.type }),
        ...(dto.title && { title: dto.title }),
        ...(dto.notes !== undefined && { notes: dto.notes }),
        ...(dto.schedule !== undefined && { schedule: dto.schedule }),
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
      },
      select: {
        id: true,
        type: true,
        title: true,
        notes: true,
        schedule: true,
        isActive: true,
        completed: true,
        completedAt: true,
        lastFiredAt: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    // Process completion status based on daily reset
    return {
      ...updatedReminder,
      completed: this.isCompletedToday(updatedReminder.completedAt),
    };
  }

  async remove(reminderId: string, userId: string) {
    const reminder = await this.prisma.reminder.findUnique({
      where: { id: reminderId },
      select: { id: true, patientId: true },
    });

    if (!reminder) {
      throw new NotFoundException('Reminder not found');
    }

    // Check edit access to the patient
    const hasEditAccess = await this.hasPatientEditAccess(
      userId,
      reminder.patientId,
    );
    if (!hasEditAccess) {
      throw new ForbiddenException(
        'Insufficient permissions to delete this reminder',
      );
    }

    await this.prisma.reminder.delete({
      where: { id: reminderId },
    });

    return { success: true };
  }

  async markCompleted(reminderId: string, userId: string) {
    const reminder = await this.prisma.reminder.findUnique({
      where: { id: reminderId },
      select: { id: true, patientId: true, completedAt: true },
    });

    if (!reminder) {
      throw new NotFoundException('Reminder not found');
    }

    // Check access to the patient
    const hasAccess = await this.hasPatientAccess(userId, reminder.patientId);
    if (!hasAccess) {
      throw new ForbiddenException('No access to this reminder');
    }

    const now = new Date();

    // Check if already completed today
    const isCompletedToday = this.isCompletedToday(reminder.completedAt);

    const updatedReminder = await this.prisma.reminder.update({
      where: { id: reminderId },
      data: {
        completed: true,
        completedAt: now,
        lastFiredAt: now,
      },
      select: {
        id: true,
        type: true,
        title: true,
        notes: true,
        schedule: true,
        isActive: true,
        completed: true,
        completedAt: true,
        lastFiredAt: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return updatedReminder;
  }

  private async hasPatientAccess(
    userId: string,
    patientId: string,
  ): Promise<boolean> {
    // Allow the patient to access their own reminders
    if (userId === patientId) {
      return true;
    }
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

  private async hasPatientEditAccess(
    userId: string,
    patientId: string,
  ): Promise<boolean> {
    const relation = await this.prisma.patientCaregiver.findUnique({
      where: {
        patientId_caregiverId: {
          patientId,
          caregiverId: userId,
        },
      },
    });

    return (
      !!relation &&
      (relation.role === CaregiverRole.OWNER ||
        relation.role === CaregiverRole.EDITOR)
    );
  }

  /**
   * Check if a reminder was completed today
   * This enables daily reset functionality
   */
  private isCompletedToday(completedAt: Date | null): boolean {
    if (!completedAt) {
      return false;
    }

    const today = new Date();
    const completedDate = new Date(completedAt);

    // Reset time to start of day for comparison
    today.setHours(0, 0, 0, 0);
    completedDate.setHours(0, 0, 0, 0);

    return today.getTime() === completedDate.getTime();
  }
}
