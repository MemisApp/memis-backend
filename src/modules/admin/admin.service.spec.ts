import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import * as bcrypt from 'bcrypt';

import { AdminService } from './admin.service';
import { PrismaService } from '../../prisma/prisma.service';

jest.mock('bcrypt', () => ({
  hash: jest.fn().mockResolvedValue('hashed_password'),
}));

describe('AdminService', () => {
  let service: AdminService;

  const mockPrisma = {
    user: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      count: jest.fn(),
    },
    patient: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      delete: jest.fn(),
      count: jest.fn(),
    },
    room: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      count: jest.fn(),
    },
    thread: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      delete: jest.fn(),
      count: jest.fn(),
    },
    message: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      delete: jest.fn(),
      count: jest.fn(),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<AdminService>(AdminService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  const mockUser = {
    id: 'user-1',
    firstName: 'John',
    lastName: 'Doe',
    email: 'john@example.com',
    phone: null,
    role: Role.CAREGIVER,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  // findAllUsers

  describe('findAllUsers', () => {
    it('returns paginated users', async () => {
      mockPrisma.user.findMany.mockResolvedValue([mockUser]);
      mockPrisma.user.count.mockResolvedValue(1);

      const result = await service.findAllUsers(1, 20);

      expect(result.items).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(result.page).toBe(1);
      expect(result.pageSize).toBe(20);
    });

    it('clamps pageSize to 100 at most', async () => {
      mockPrisma.user.findMany.mockResolvedValue([]);
      mockPrisma.user.count.mockResolvedValue(0);

      const result = await service.findAllUsers(1, 999);

      expect(result.pageSize).toBe(100);
    });

    it('clamps pageSize to 1 at minimum', async () => {
      mockPrisma.user.findMany.mockResolvedValue([]);
      mockPrisma.user.count.mockResolvedValue(0);

      const result = await service.findAllUsers(1, 0);

      expect(result.pageSize).toBe(1);
    });

    it('applies an insensitive search filter when search is given', async () => {
      mockPrisma.user.findMany.mockResolvedValue([mockUser]);
      mockPrisma.user.count.mockResolvedValue(1);

      await service.findAllUsers(1, 20, 'john');

      expect(mockPrisma.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ OR: expect.any(Array) }),
        }),
      );
    });

    it('uses an empty where clause when no search is given', async () => {
      mockPrisma.user.findMany.mockResolvedValue([]);
      mockPrisma.user.count.mockResolvedValue(0);

      await service.findAllUsers();

      expect(mockPrisma.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: {} }),
      );
    });
  });

  // findUserById

  describe('findUserById', () => {
    it('returns a user by id', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);

      const result = await service.findUserById('user-1');

      expect(result).toEqual(mockUser);
    });

    it('throws NotFoundException when user does not exist', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      await expect(service.findUserById('unknown')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // createUser

  describe('createUser', () => {
    const createDto = {
      email: 'New@Example.COM',
      password: 'Password123!',
      firstName: 'Jane',
      lastName: 'Smith',
    };

    it('creates a user and normalises the email', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);
      mockPrisma.user.create.mockResolvedValue({
        ...mockUser,
        email: 'new@example.com',
      });

      const result = await service.createUser(createDto as any);

      expect(result.email).toBe('new@example.com');
      expect(mockPrisma.user.findUnique).toHaveBeenCalledWith({
        where: { email: 'new@example.com' },
      });
    });

    it('defaults role to CAREGIVER when not provided', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);
      mockPrisma.user.create.mockResolvedValue(mockUser);

      await service.createUser(createDto as any);

      expect(mockPrisma.user.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ role: Role.CAREGIVER }),
        }),
      );
    });

    it('throws ConflictException when email is already taken', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ id: 'existing' });

      await expect(service.createUser(createDto as any)).rejects.toThrow(
        ConflictException,
      );
    });

    it('hashes the password before storing', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);
      mockPrisma.user.create.mockResolvedValue(mockUser);

      await service.createUser(createDto as any);

      expect(bcrypt.hash).toHaveBeenCalledWith('Password123!', 12);
      expect(mockPrisma.user.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ passwordHash: 'hashed_password' }),
        }),
      );
    });
  });

  // updateUser

  describe('updateUser', () => {
    it('updates and returns the user', async () => {
      const updated = { ...mockUser, firstName: 'Updated' };
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);
      mockPrisma.user.update.mockResolvedValue(updated);

      const result = await service.updateUser('user-1', {
        firstName: 'Updated',
      } as any);

      expect(result.firstName).toBe('Updated');
    });

    it('throws NotFoundException when user does not exist', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      await expect(
        service.updateUser('unknown', { firstName: 'X' } as any),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws ConflictException when the new email is taken by another user', async () => {
      mockPrisma.user.findUnique
        .mockResolvedValueOnce(mockUser) // find current user
        .mockResolvedValueOnce({ id: 'other-user' }); // email conflict check

      await expect(
        service.updateUser('user-1', { email: 'taken@example.com' } as any),
      ).rejects.toThrow(ConflictException);
    });

    it('throws BadRequestException when new password is shorter than 8 chars', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);

      await expect(
        service.updateUser('user-1', { password: 'short' } as any),
      ).rejects.toThrow(BadRequestException);
    });

    it('hashes a valid new password before storing', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);
      mockPrisma.user.update.mockResolvedValue(mockUser);

      await service.updateUser('user-1', { password: 'NewPassword1!' } as any);

      expect(bcrypt.hash).toHaveBeenCalledWith('NewPassword1!', 12);
    });
  });

  // deleteUser

  describe('deleteUser', () => {
    it('deletes user and returns success', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);
      mockPrisma.user.delete.mockResolvedValue({});

      const result = await service.deleteUser('user-1');

      expect(result).toEqual({ success: true });
      expect(mockPrisma.user.delete).toHaveBeenCalledWith({
        where: { id: 'user-1' },
      });
    });

    it('throws NotFoundException when user does not exist', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      await expect(service.deleteUser('unknown')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // deleteRoom

  describe('deleteRoom', () => {
    const mockRoom = { id: 'room-1', name: 'Room A' };

    it('deletes a room and returns success', async () => {
      mockPrisma.room.findUnique.mockResolvedValue(mockRoom);
      mockPrisma.room.delete.mockResolvedValue({});

      const result = await service.deleteRoom('room-1');

      expect(result).toEqual({ success: true });
    });

    it('throws NotFoundException when room does not exist', async () => {
      mockPrisma.room.findUnique.mockResolvedValue(null);

      await expect(service.deleteRoom('unknown')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // deletePatient

  describe('deletePatient', () => {
    const mockPatient = { id: 'patient-1', firstName: 'Alice' };

    it('deletes a patient and returns success', async () => {
      mockPrisma.patient.findUnique.mockResolvedValue(mockPatient);
      mockPrisma.patient.delete.mockResolvedValue({});

      const result = await service.deletePatient('patient-1');

      expect(result).toEqual({ success: true });
    });

    it('throws NotFoundException when patient does not exist', async () => {
      mockPrisma.patient.findUnique.mockResolvedValue(null);

      await expect(service.deletePatient('unknown')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // getDashboardStats

  describe('getDashboardStats', () => {
    it('returns aggregate counts for the dashboard', async () => {
      mockPrisma.user.count
        .mockResolvedValueOnce(10)  // total users
        .mockResolvedValueOnce(7)   // caregivers
        .mockResolvedValueOnce(1);  // admins
      mockPrisma.patient.count.mockResolvedValue(5);
      mockPrisma.room.count.mockResolvedValue(3);
      mockPrisma.thread.count.mockResolvedValue(12);
      mockPrisma.message.count.mockResolvedValue(50);

      const result = await service.getDashboardStats();

      expect(result.users.total).toBe(10);
      expect(result.users.caregivers).toBe(7);
      expect(result.users.admins).toBe(1);
      expect(result.patients.total).toBe(5);
      expect(result.rooms.total).toBe(3);
      expect(result.threads.total).toBe(12);
      expect(result.messages.total).toBe(50);
    });
  });
});
