import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateReminderDto } from './dto/create-reminder.dto';
import { UpdateReminderDto } from './dto/update-reminder.dto';
import { CaregiverRole } from '@prisma/client';

const REMINDER_SELECT = {
  id: true,
  type: true,
  title: true,
  notes: true,
  schedule: true,
  recurrence: true,
  scheduledDate: true,
  isActive: true,
  completed: true,
  completedAt: true,
  lastFiredAt: true,
  createdAt: true,
  updatedAt: true,
} as const;

@Injectable()
export class RemindersService {
  constructor(private prisma: PrismaService) {}

  async create(patientId: string, userId: string, dto: CreateReminderDto) {
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
        recurrence: dto.recurrence ?? 'DAILY',
        scheduledDate: dto.scheduledDate ? new Date(dto.scheduledDate) : null,
        isActive: dto.isActive ?? true,
      },
      select: REMINDER_SELECT,
    });

    return reminder;
  }

  async findByPatient(patientId: string, userId: string) {
    const hasAccess = await this.hasPatientAccess(userId, patientId);
    if (!hasAccess) {
      throw new ForbiddenException('No access to this patient');
    }

    const reminders = await this.prisma.reminder.findMany({
      where: { patientId },
      select: REMINDER_SELECT,
      orderBy: [
        { isActive: 'desc' },
        { createdAt: 'desc' },
      ],
    });

    return reminders.map((reminder) => ({
      ...reminder,
      completed: this.isCompletedToday(reminder.completedAt),
    }));
  }

  async findOne(reminderId: string, userId: string) {
    const reminder = await this.prisma.reminder.findUnique({
      where: { id: reminderId },
      select: { ...REMINDER_SELECT, patientId: true },
    });

    if (!reminder) {
      throw new NotFoundException('Reminder not found');
    }

    const hasAccess = await this.hasPatientAccess(userId, reminder.patientId);
    if (!hasAccess) {
      throw new ForbiddenException('No access to this reminder');
    }

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
        ...(dto.recurrence && { recurrence: dto.recurrence }),
        ...(dto.scheduledDate !== undefined && {
          scheduledDate: dto.scheduledDate ? new Date(dto.scheduledDate) : null,
        }),
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
      },
      select: REMINDER_SELECT,
    });

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

    const hasAccess = await this.hasPatientAccess(userId, reminder.patientId);
    if (!hasAccess) {
      throw new ForbiddenException('No access to this reminder');
    }

    const now = new Date();
    this.isCompletedToday(reminder.completedAt);

    const updatedReminder = await this.prisma.reminder.update({
      where: { id: reminderId },
      data: {
        completed: true,
        completedAt: now,
        lastFiredAt: now,
      },
      select: REMINDER_SELECT,
    });

    return updatedReminder;
  }

  private async hasPatientAccess(
    userId: string,
    patientId: string,
  ): Promise<boolean> {
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

  private isCompletedToday(completedAt: Date | null): boolean {
    if (!completedAt) {
      return false;
    }

    const today = new Date();
    const completedDate = new Date(completedAt);

    today.setHours(0, 0, 0, 0);
    completedDate.setHours(0, 0, 0, 0);

    return today.getTime() === completedDate.getTime();
  }
}
