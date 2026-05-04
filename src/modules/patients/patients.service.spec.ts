import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { CaregiverRole, Role } from '@prisma/client';

import { PatientsService } from './patients.service';
import { PrismaService } from '../../prisma/prisma.service';

describe('PatientsService', () => {
  let service: PatientsService;

  // The $transaction mock executes the callback with the same mock object so
  // that inner tx.patient.create / tx.contact.create calls are intercepted.
  const mockPrisma = {
    user: { findUnique: jest.fn() },
    patient: {
      create: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    patientCaregiver: { findUnique: jest.fn() },
    contact: { create: jest.fn() },
    pairingCode: {
      create: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      delete: jest.fn(),
    },
    $transaction: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PatientsService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<PatientsService>(PatientsService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  const CAREGIVER_ID = 'caregiver-1';
  const PATIENT_ID = 'patient-1';

  const mockCaregiver = {
    firstName: 'John',
    lastName: 'Doe',
    phone: '+1234567890',
    email: 'john@example.com',
    avatarUrl: null,
  };

  const mockPatient = {
    id: PATIENT_ID,
    firstName: 'Alice',
    lastName: 'Smith',
    birthDate: null,
    avatarUrl: null,
    shortIntro: null,
    maritalDate: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const ownerRelation = { role: CaregiverRole.OWNER };
  const editorRelation = { role: CaregiverRole.EDITOR };
  const viewerRelation = { role: CaregiverRole.VIEWER };

  // create

  describe('create', () => {
    const createDto = { firstName: 'Alice', lastName: 'Smith' };

    beforeEach(() => {
      // Simulate $transaction calling the callback with mockPrisma as tx
      mockPrisma.$transaction.mockImplementation((cb: (tx: typeof mockPrisma) => Promise<unknown>) =>
        cb(mockPrisma),
      );
    });

    it('creates patient, caregiver link, emergency contact and pairing code', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(mockCaregiver);
      mockPrisma.patient.create.mockResolvedValue(mockPatient);
      mockPrisma.contact.create.mockResolvedValue({});
      // hasPatientAccess is called inside generatePairingCode
      mockPrisma.patientCaregiver.findUnique.mockResolvedValue(ownerRelation);
      mockPrisma.pairingCode.create.mockResolvedValue({
        id: 'code-1',
        code: 'ABCD1234',
        expiresAt: new Date(),
        createdAt: new Date(),
      });

      const result = await service.create(CAREGIVER_ID, createDto as any);

      expect(result.patient).toEqual(mockPatient);
      expect(result.pairingCode).toBeDefined();
      expect(mockPrisma.contact.create).toHaveBeenCalled();
    });

    it('throws NotFoundException when caregiver user does not exist', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      await expect(
        service.create(CAREGIVER_ID, createDto as any),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // findByCaregiver

  describe('findByCaregiver', () => {
    it('returns a list of patients with caregiver metadata', async () => {
      mockPrisma.patientCaregiver.findUnique; // not used here
      const mockRelations = [
        {
          patient: mockPatient,
          role: CaregiverRole.OWNER,
          createdAt: new Date('2024-01-01'),
        },
      ];
      // findByCaregiver uses patientCaregiver.findMany
      (mockPrisma as any).patientCaregiver.findMany = jest
        .fn()
        .mockResolvedValue(mockRelations);

      const result = await service.findByCaregiver(CAREGIVER_ID);

      expect(result).toHaveLength(1);
      expect(result[0].caregiverRole).toBe(CaregiverRole.OWNER);
    });
  });

  // findOne

  describe('findOne', () => {
    it('returns the patient when the user has access', async () => {
      mockPrisma.patientCaregiver.findUnique.mockResolvedValue(ownerRelation);
      mockPrisma.patient.findUnique.mockResolvedValue(mockPatient);

      const result = await service.findOne(PATIENT_ID, CAREGIVER_ID);

      expect(result).toEqual(mockPatient);
    });

    it('throws ForbiddenException when user has no caregiver relation', async () => {
      mockPrisma.patientCaregiver.findUnique.mockResolvedValue(null);

      await expect(
        service.findOne(PATIENT_ID, CAREGIVER_ID),
      ).rejects.toThrow(ForbiddenException);
    });

    it('throws NotFoundException when patient does not exist', async () => {
      mockPrisma.patientCaregiver.findUnique.mockResolvedValue(ownerRelation);
      mockPrisma.patient.findUnique.mockResolvedValue(null);

      await expect(
        service.findOne(PATIENT_ID, CAREGIVER_ID),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // update

  describe('update', () => {
    const updateDto = { firstName: 'Updated' };

    it('updates and returns the patient for an OWNER', async () => {
      mockPrisma.patientCaregiver.findUnique.mockResolvedValue(ownerRelation);
      mockPrisma.patient.update.mockResolvedValue({
        ...mockPatient,
        firstName: 'Updated',
      });

      const result = await service.update(
        PATIENT_ID,
        CAREGIVER_ID,
        updateDto as any,
      );

      expect(result.firstName).toBe('Updated');
    });

    it('updates and returns the patient for an EDITOR', async () => {
      mockPrisma.patientCaregiver.findUnique.mockResolvedValue(editorRelation);
      mockPrisma.patient.update.mockResolvedValue({
        ...mockPatient,
        firstName: 'Updated',
      });

      const result = await service.update(
        PATIENT_ID,
        CAREGIVER_ID,
        updateDto as any,
      );

      expect(result.firstName).toBe('Updated');
    });

    it('throws ForbiddenException for a VIEWER', async () => {
      mockPrisma.patientCaregiver.findUnique.mockResolvedValue(viewerRelation);

      await expect(
        service.update(PATIENT_ID, CAREGIVER_ID, updateDto as any),
      ).rejects.toThrow(ForbiddenException);
    });

    it('throws ForbiddenException when user has no relation', async () => {
      mockPrisma.patientCaregiver.findUnique.mockResolvedValue(null);

      await expect(
        service.update(PATIENT_ID, CAREGIVER_ID, updateDto as any),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  // remove

  describe('remove', () => {
    it('allows an ADMIN to delete any patient', async () => {
      // isPatientOwner check is skipped because isAdmin = true
      mockPrisma.patient.delete.mockResolvedValue({});

      const result = await service.remove(PATIENT_ID, 'admin-id', Role.ADMIN);

      expect(result).toEqual({ success: true });
      expect(mockPrisma.patient.delete).toHaveBeenCalledWith({
        where: { id: PATIENT_ID },
      });
    });

    it('allows the OWNER caregiver to delete their patient', async () => {
      mockPrisma.patientCaregiver.findUnique.mockResolvedValue(ownerRelation);
      mockPrisma.patient.delete.mockResolvedValue({});

      const result = await service.remove(
        PATIENT_ID,
        CAREGIVER_ID,
        Role.CAREGIVER,
      );

      expect(result).toEqual({ success: true });
    });

    it('throws ForbiddenException for a non-owner caregiver', async () => {
      mockPrisma.patientCaregiver.findUnique.mockResolvedValue(editorRelation);

      await expect(
        service.remove(PATIENT_ID, CAREGIVER_ID, Role.CAREGIVER),
      ).rejects.toThrow(ForbiddenException);
    });

    it('throws ForbiddenException when user has no relation', async () => {
      mockPrisma.patientCaregiver.findUnique.mockResolvedValue(null);

      await expect(
        service.remove(PATIENT_ID, CAREGIVER_ID, Role.CAREGIVER),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  // generatePairingCode

  describe('generatePairingCode', () => {
    it('creates and returns a pairing code for a user with access', async () => {
      const mockCode = {
        id: 'code-1',
        code: 'ABCD1234',
        expiresAt: new Date(),
        createdAt: new Date(),
      };
      mockPrisma.patientCaregiver.findUnique.mockResolvedValue(ownerRelation);
      mockPrisma.pairingCode.create.mockResolvedValue(mockCode);

      const result = await service.generatePairingCode(
        PATIENT_ID,
        CAREGIVER_ID,
      );

      expect(result).toEqual(mockCode);
      expect(mockPrisma.pairingCode.create).toHaveBeenCalled();
    });

    it('throws ForbiddenException when user has no access', async () => {
      mockPrisma.patientCaregiver.findUnique.mockResolvedValue(null);

      await expect(
        service.generatePairingCode(PATIENT_ID, CAREGIVER_ID),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  // revokePairingCode

  describe('revokePairingCode', () => {
    const mockCode = {
      id: 'code-1',
      patientId: PATIENT_ID,
      patient: { id: PATIENT_ID },
    };

    it('deletes the pairing code and returns success', async () => {
      mockPrisma.pairingCode.findUnique.mockResolvedValue(mockCode);
      mockPrisma.patientCaregiver.findUnique.mockResolvedValue(ownerRelation);
      mockPrisma.pairingCode.delete.mockResolvedValue({});

      const result = await service.revokePairingCode('code-1', CAREGIVER_ID);

      expect(result).toEqual({ success: true });
    });

    it('throws NotFoundException when pairing code does not exist', async () => {
      mockPrisma.pairingCode.findUnique.mockResolvedValue(null);

      await expect(
        service.revokePairingCode('code-1', CAREGIVER_ID),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws ForbiddenException when user has no access to the patient', async () => {
      mockPrisma.pairingCode.findUnique.mockResolvedValue(mockCode);
      mockPrisma.patientCaregiver.findUnique.mockResolvedValue(null);

      await expect(
        service.revokePairingCode('code-1', CAREGIVER_ID),
      ).rejects.toThrow(ForbiddenException);
    });
  });
});
