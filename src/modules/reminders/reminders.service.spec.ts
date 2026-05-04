import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { CaregiverRole } from '@prisma/client';

import { RemindersService } from './reminders.service';
import { PrismaService } from '../../prisma/prisma.service';

describe('RemindersService', () => {
  let service: RemindersService;

  const mockPrisma = {
    reminder: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    patientCaregiver: {
      findUnique: jest.fn(),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RemindersService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<RemindersService>(RemindersService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  const PATIENT_ID = 'patient-1';
  const USER_ID = 'user-1';
  const REMINDER_ID = 'reminder-1';

  const ownerRelation = { role: CaregiverRole.OWNER };
  const editorRelation = { role: CaregiverRole.EDITOR };
  const viewerRelation = { role: CaregiverRole.VIEWER };

  const makeReminder = (completedAt: Date | null = null) => ({
    id: REMINDER_ID,
    patientId: PATIENT_ID,
    type: 'MEDICATION',
    title: 'Take pills',
    notes: null,
    schedule: null,
    isActive: true,
    completed: completedAt !== null,
    completedAt,
    lastFiredAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  // create

  describe('create', () => {
    const createDto = { type: 'MEDICATION', title: 'Take pills' };

    it('creates a reminder for an OWNER', async () => {
      const mockReminder = makeReminder();
      mockPrisma.patientCaregiver.findUnique.mockResolvedValue(ownerRelation);
      mockPrisma.reminder.create.mockResolvedValue(mockReminder);

      const result = await service.create(
        PATIENT_ID,
        USER_ID,
        createDto as any,
      );

      expect(result).toEqual(mockReminder);
    });

    it('creates a reminder for an EDITOR', async () => {
      const mockReminder = makeReminder();
      mockPrisma.patientCaregiver.findUnique.mockResolvedValue(editorRelation);
      mockPrisma.reminder.create.mockResolvedValue(mockReminder);

      const result = await service.create(
        PATIENT_ID,
        USER_ID,
        createDto as any,
      );

      expect(result).toEqual(mockReminder);
    });

    it('throws ForbiddenException for a VIEWER', async () => {
      mockPrisma.patientCaregiver.findUnique.mockResolvedValue(viewerRelation);

      await expect(
        service.create(PATIENT_ID, USER_ID, createDto as any),
      ).rejects.toThrow(ForbiddenException);
    });

    it('throws ForbiddenException when user has no caregiver relation', async () => {
      mockPrisma.patientCaregiver.findUnique.mockResolvedValue(null);

      await expect(
        service.create(PATIENT_ID, USER_ID, createDto as any),
      ).rejects.toThrow(ForbiddenException);
    });

    it('defaults isActive to true when not provided in DTO', async () => {
      const mockReminder = makeReminder();
      mockPrisma.patientCaregiver.findUnique.mockResolvedValue(ownerRelation);
      mockPrisma.reminder.create.mockResolvedValue(mockReminder);

      await service.create(PATIENT_ID, USER_ID, createDto as any);

      expect(mockPrisma.reminder.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ isActive: true }),
        }),
      );
    });
  });

  // findByPatient

  describe('findByPatient', () => {
    it('returns reminders for a caregiver with access', async () => {
      const mockReminder = makeReminder();
      mockPrisma.patientCaregiver.findUnique.mockResolvedValue(ownerRelation);
      mockPrisma.reminder.findMany.mockResolvedValue([mockReminder]);

      const result = await service.findByPatient(PATIENT_ID, USER_ID);

      expect(result).toHaveLength(1);
    });

    it('allows patient to access their own reminders (userId === patientId)', async () => {
      mockPrisma.reminder.findMany.mockResolvedValue([makeReminder()]);

      const result = await service.findByPatient(PATIENT_ID, PATIENT_ID);

      expect(result).toHaveLength(1);
      expect(mockPrisma.patientCaregiver.findUnique).not.toHaveBeenCalled();
    });

    it('throws ForbiddenException when user has no access', async () => {
      mockPrisma.patientCaregiver.findUnique.mockResolvedValue(null);

      await expect(
        service.findByPatient(PATIENT_ID, USER_ID),
      ).rejects.toThrow(ForbiddenException);
    });

    it('returns completed=true only when reminder was completed today', async () => {
      const today = new Date();
      const yesterdayReminder = makeReminder(
        new Date(today.getTime() - 86_400_000),
      );
      const todayReminder = makeReminder(today);

      mockPrisma.patientCaregiver.findUnique.mockResolvedValue(ownerRelation);
      mockPrisma.reminder.findMany.mockResolvedValue([
        yesterdayReminder,
        todayReminder,
      ]);

      const result = await service.findByPatient(PATIENT_ID, USER_ID);

      expect(result[0].completed).toBe(false); // completed yesterday → reset
      expect(result[1].completed).toBe(true);  // completed today → still done
    });
  });

  // findOne

  describe('findOne', () => {
    it('returns the reminder when user has access', async () => {
      const mockReminder = makeReminder();
      mockPrisma.reminder.findUnique.mockResolvedValue(mockReminder);
      mockPrisma.patientCaregiver.findUnique.mockResolvedValue(ownerRelation);

      const result = await service.findOne(REMINDER_ID, USER_ID);

      expect(result.id).toBe(REMINDER_ID);
    });

    it('throws NotFoundException when reminder does not exist', async () => {
      mockPrisma.reminder.findUnique.mockResolvedValue(null);

      await expect(service.findOne(REMINDER_ID, USER_ID)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('throws ForbiddenException when user has no patient access', async () => {
      mockPrisma.reminder.findUnique.mockResolvedValue(makeReminder());
      mockPrisma.patientCaregiver.findUnique.mockResolvedValue(null);

      await expect(service.findOne(REMINDER_ID, USER_ID)).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  // update

  describe('update', () => {
    const updateDto = { title: 'Updated title' };

    it('updates and returns the reminder for an OWNER', async () => {
      const updated = { ...makeReminder(), title: 'Updated title' };
      mockPrisma.reminder.findUnique.mockResolvedValue({
        id: REMINDER_ID,
        patientId: PATIENT_ID,
      });
      mockPrisma.patientCaregiver.findUnique.mockResolvedValue(ownerRelation);
      mockPrisma.reminder.update.mockResolvedValue(updated);

      const result = await service.update(
        REMINDER_ID,
        USER_ID,
        updateDto as any,
      );

      expect(result.title).toBe('Updated title');
    });

    it('throws NotFoundException when reminder does not exist', async () => {
      mockPrisma.reminder.findUnique.mockResolvedValue(null);

      await expect(
        service.update(REMINDER_ID, USER_ID, updateDto as any),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws ForbiddenException for a VIEWER', async () => {
      mockPrisma.reminder.findUnique.mockResolvedValue({
        id: REMINDER_ID,
        patientId: PATIENT_ID,
      });
      mockPrisma.patientCaregiver.findUnique.mockResolvedValue(viewerRelation);

      await expect(
        service.update(REMINDER_ID, USER_ID, updateDto as any),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  // remove

  describe('remove', () => {
    it('deletes the reminder and returns success', async () => {
      mockPrisma.reminder.findUnique.mockResolvedValue({
        id: REMINDER_ID,
        patientId: PATIENT_ID,
      });
      mockPrisma.patientCaregiver.findUnique.mockResolvedValue(ownerRelation);
      mockPrisma.reminder.delete.mockResolvedValue({});

      const result = await service.remove(REMINDER_ID, USER_ID);

      expect(result).toEqual({ success: true });
    });

    it('throws NotFoundException when reminder does not exist', async () => {
      mockPrisma.reminder.findUnique.mockResolvedValue(null);

      await expect(service.remove(REMINDER_ID, USER_ID)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('throws ForbiddenException for a VIEWER', async () => {
      mockPrisma.reminder.findUnique.mockResolvedValue({
        id: REMINDER_ID,
        patientId: PATIENT_ID,
      });
      mockPrisma.patientCaregiver.findUnique.mockResolvedValue(viewerRelation);

      await expect(service.remove(REMINDER_ID, USER_ID)).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  // markCompleted  

  describe('markCompleted', () => {
    it('marks the reminder as completed and returns it', async () => {
      const mockReminder = makeReminder();
      const updatedReminder = {
        ...mockReminder,
        completed: true,
        completedAt: new Date(),
      };

      mockPrisma.reminder.findUnique.mockResolvedValue(mockReminder);
      mockPrisma.patientCaregiver.findUnique.mockResolvedValue(ownerRelation);
      mockPrisma.reminder.update.mockResolvedValue(updatedReminder);

      const result = await service.markCompleted(REMINDER_ID, USER_ID);

      expect(result.completed).toBe(true);
      expect(mockPrisma.reminder.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            completed: true,
            completedAt: expect.any(Date),
          }),
        }),
      );
    });

    it('allows patient to mark their own reminder as completed', async () => {
      const mockReminder = makeReminder();
      const updatedReminder = { ...mockReminder, completed: true };
      mockPrisma.reminder.findUnique.mockResolvedValue(mockReminder);
      mockPrisma.reminder.update.mockResolvedValue(updatedReminder);

      // userId === patientId → hasPatientAccess returns true without DB call
      const result = await service.markCompleted(REMINDER_ID, PATIENT_ID);

      expect(result.completed).toBe(true);
    });

    it('throws NotFoundException when reminder does not exist', async () => {
      mockPrisma.reminder.findUnique.mockResolvedValue(null);

      await expect(
        service.markCompleted(REMINDER_ID, USER_ID),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws ForbiddenException when user has no access', async () => {
      mockPrisma.reminder.findUnique.mockResolvedValue(makeReminder());
      mockPrisma.patientCaregiver.findUnique.mockResolvedValue(null);

      await expect(
        service.markCompleted(REMINDER_ID, USER_ID),
      ).rejects.toThrow(ForbiddenException);
    });
  });
});
