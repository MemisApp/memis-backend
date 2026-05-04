import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { CaregiverRole } from '@prisma/client';

import { ContactsService } from './contacts.service';
import { PrismaService } from '../../prisma/prisma.service';

describe('ContactsService', () => {
  let service: ContactsService;

  const mockPrisma = {
    contact: {
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
        ContactsService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<ContactsService>(ContactsService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  const PATIENT_ID = 'patient-1';
  const USER_ID = 'user-1';
  const CONTACT_ID = 'contact-1';

  const ownerRelation = { role: CaregiverRole.OWNER };
  const editorRelation = { role: CaregiverRole.EDITOR };
  const viewerRelation = { role: CaregiverRole.VIEWER };

  const mockContact = {
    id: CONTACT_ID,
    patientId: PATIENT_ID,
    relation: 'FAMILY',
    name: 'Jane Doe',
    phone: '+1234567890',
    photoUrl: null,
    description: null,
    isEmergencyContact: false,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  // findByPatient

  describe('findByPatient', () => {
    it('returns contacts when caregiver has any relation to patient', async () => {
      mockPrisma.patientCaregiver.findUnique.mockResolvedValue(ownerRelation);
      mockPrisma.contact.findMany.mockResolvedValue([mockContact]);

      const result = await service.findByPatient(PATIENT_ID, USER_ID);

      expect(result).toEqual([mockContact]);
      expect(mockPrisma.contact.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { patientId: PATIENT_ID } }),
      );
    });

    it('allows a patient to read their own contacts (userId === patientId)', async () => {
      mockPrisma.contact.findMany.mockResolvedValue([mockContact]);

      const result = await service.findByPatient(PATIENT_ID, PATIENT_ID);

      expect(result).toEqual([mockContact]);
      expect(mockPrisma.patientCaregiver.findUnique).not.toHaveBeenCalled();
    });

    it('throws ForbiddenException when user has no relation to patient', async () => {
      mockPrisma.patientCaregiver.findUnique.mockResolvedValue(null);

      await expect(
        service.findByPatient(PATIENT_ID, USER_ID),
      ).rejects.toThrow(ForbiddenException);
    });

    it('returns VIEWER-accessible contacts too (any relation grants read)', async () => {
      mockPrisma.patientCaregiver.findUnique.mockResolvedValue(viewerRelation);
      mockPrisma.contact.findMany.mockResolvedValue([mockContact]);

      const result = await service.findByPatient(PATIENT_ID, USER_ID);

      expect(result).toEqual([mockContact]);
    });
  });

  // create

  describe('create', () => {
    const createDto = {
      relation: 'FAMILY',
      name: 'Jane Doe',
      phone: '+1234567890',
      isEmergencyContact: false,
    };

    it('creates and returns a contact for an OWNER', async () => {
      mockPrisma.patientCaregiver.findUnique.mockResolvedValue(ownerRelation);
      mockPrisma.contact.create.mockResolvedValue(mockContact);

      const result = await service.create(PATIENT_ID, USER_ID, createDto as any);

      expect(result).toEqual(mockContact);
    });

    it('creates and returns a contact for an EDITOR', async () => {
      mockPrisma.patientCaregiver.findUnique.mockResolvedValue(editorRelation);
      mockPrisma.contact.create.mockResolvedValue(mockContact);

      const result = await service.create(PATIENT_ID, USER_ID, createDto as any);

      expect(result).toEqual(mockContact);
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

    it('defaults isEmergencyContact to false when not provided', async () => {
      const dtoWithoutFlag = { relation: 'FAMILY', name: 'Bob', phone: '123' };
      mockPrisma.patientCaregiver.findUnique.mockResolvedValue(ownerRelation);
      mockPrisma.contact.create.mockResolvedValue(mockContact);

      await service.create(PATIENT_ID, USER_ID, dtoWithoutFlag as any);

      expect(mockPrisma.contact.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ isEmergencyContact: false }),
        }),
      );
    });
  });

  // findOne

  describe('findOne', () => {
    it('returns the contact when user has access to the patient', async () => {
      mockPrisma.contact.findUnique.mockResolvedValue(mockContact);
      mockPrisma.patientCaregiver.findUnique.mockResolvedValue(ownerRelation);

      const result = await service.findOne(CONTACT_ID, USER_ID);

      expect(result).toEqual(mockContact);
    });

    it('throws NotFoundException when contact does not exist', async () => {
      mockPrisma.contact.findUnique.mockResolvedValue(null);

      await expect(service.findOne(CONTACT_ID, USER_ID)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('throws ForbiddenException when user has no access to the patient', async () => {
      mockPrisma.contact.findUnique.mockResolvedValue(mockContact);
      mockPrisma.patientCaregiver.findUnique.mockResolvedValue(null);

      await expect(service.findOne(CONTACT_ID, USER_ID)).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  // update

  describe('update', () => {
    const updateDto = { name: 'Updated Name' };

    it('updates and returns the contact for an OWNER', async () => {
      mockPrisma.contact.findUnique.mockResolvedValue({
        id: CONTACT_ID,
        patientId: PATIENT_ID,
      });
      mockPrisma.patientCaregiver.findUnique.mockResolvedValue(ownerRelation);
      mockPrisma.contact.update.mockResolvedValue({
        ...mockContact,
        name: 'Updated Name',
      });

      const result = await service.update(CONTACT_ID, USER_ID, updateDto as any);

      expect(result.name).toBe('Updated Name');
    });

    it('updates and returns the contact for an EDITOR', async () => {
      mockPrisma.contact.findUnique.mockResolvedValue({
        id: CONTACT_ID,
        patientId: PATIENT_ID,
      });
      mockPrisma.patientCaregiver.findUnique.mockResolvedValue(editorRelation);
      mockPrisma.contact.update.mockResolvedValue({
        ...mockContact,
        name: 'Updated Name',
      });

      const result = await service.update(CONTACT_ID, USER_ID, updateDto as any);

      expect(result.name).toBe('Updated Name');
    });

    it('throws NotFoundException when contact does not exist', async () => {
      mockPrisma.contact.findUnique.mockResolvedValue(null);

      await expect(
        service.update(CONTACT_ID, USER_ID, updateDto as any),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws ForbiddenException for a VIEWER', async () => {
      mockPrisma.contact.findUnique.mockResolvedValue({
        id: CONTACT_ID,
        patientId: PATIENT_ID,
      });
      mockPrisma.patientCaregiver.findUnique.mockResolvedValue(viewerRelation);

      await expect(
        service.update(CONTACT_ID, USER_ID, updateDto as any),
      ).rejects.toThrow(ForbiddenException);
    });

    it('throws ForbiddenException when user has no caregiver relation', async () => {
      mockPrisma.contact.findUnique.mockResolvedValue({
        id: CONTACT_ID,
        patientId: PATIENT_ID,
      });
      mockPrisma.patientCaregiver.findUnique.mockResolvedValue(null);

      await expect(
        service.update(CONTACT_ID, USER_ID, updateDto as any),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  // remove

  describe('remove', () => {
    it('deletes the contact and returns success for an OWNER', async () => {
      mockPrisma.contact.findUnique.mockResolvedValue({
        id: CONTACT_ID,
        patientId: PATIENT_ID,
      });
      mockPrisma.patientCaregiver.findUnique.mockResolvedValue(ownerRelation);
      mockPrisma.contact.delete.mockResolvedValue({});

      const result = await service.remove(CONTACT_ID, USER_ID);

      expect(result).toEqual({ success: true });
      expect(mockPrisma.contact.delete).toHaveBeenCalledWith({
        where: { id: CONTACT_ID },
      });
    });

    it('throws NotFoundException when contact does not exist', async () => {
      mockPrisma.contact.findUnique.mockResolvedValue(null);

      await expect(service.remove(CONTACT_ID, USER_ID)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('throws ForbiddenException when user has no edit access', async () => {
      mockPrisma.contact.findUnique.mockResolvedValue({
        id: CONTACT_ID,
        patientId: PATIENT_ID,
      });
      mockPrisma.patientCaregiver.findUnique.mockResolvedValue(null);

      await expect(service.remove(CONTACT_ID, USER_ID)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('throws ForbiddenException for a VIEWER trying to delete', async () => {
      mockPrisma.contact.findUnique.mockResolvedValue({
        id: CONTACT_ID,
        patientId: PATIENT_ID,
      });
      mockPrisma.patientCaregiver.findUnique.mockResolvedValue(viewerRelation);

      await expect(service.remove(CONTACT_ID, USER_ID)).rejects.toThrow(
        ForbiddenException,
      );
    });
  });
});
