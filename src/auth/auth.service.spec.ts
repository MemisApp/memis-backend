import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';

import { AuthService } from './auth.service';
import { PrismaService } from '../prisma/prisma.service';

jest.mock('bcrypt', () => ({
  hash: jest.fn().mockResolvedValue('hashed_password'),
  compare: jest.fn(),
}));

describe('AuthService', () => {
  let service: AuthService;

  const mockPrisma = {
    user: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    userSession: {
      create: jest.fn(),
      update: jest.fn(),
      deleteMany: jest.fn(),
    },
    pairingCode: {
      findFirst: jest.fn(),
      update: jest.fn(),
    },
    device: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
  };

  const mockJwt = {
    signAsync: jest.fn().mockResolvedValue('mock_token'),
  };

  const mockConfig = {
    get: jest.fn().mockReturnValue('test_secret'),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: JwtService, useValue: mockJwt },
        { provide: ConfigService, useValue: mockConfig },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // register

  describe('register', () => {
    const dto = {
      email: 'Test@Example.COM',
      password: 'Password123!',
      firstName: 'John',
      lastName: 'Doe',
      role: 'CAREGIVER',
    };

    const mockUser = {
      id: 'user-1',
      email: 'test@example.com',
      firstName: 'John',
      lastName: 'Doe',
      role: 'CAREGIVER',
    };
    const mockSession = { id: 'session-1' };

    it('registers a new user and returns tokens', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);
      mockPrisma.user.create.mockResolvedValue(mockUser);
      mockPrisma.userSession.create.mockResolvedValue(mockSession);
      mockPrisma.userSession.update.mockResolvedValue(mockSession);

      const result = await service.register(dto as any);

      expect(result.user).toEqual(mockUser);
      expect(result.accessToken).toBe('mock_token');
      expect(result.sessionId).toBe('session-1');
    });

    it('normalises email to lowercase before uniqueness check', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);
      mockPrisma.user.create.mockResolvedValue(mockUser);
      mockPrisma.userSession.create.mockResolvedValue(mockSession);
      mockPrisma.userSession.update.mockResolvedValue(mockSession);

      await service.register(dto as any);

      expect(mockPrisma.user.findUnique).toHaveBeenCalledWith({
        where: { email: 'test@example.com' },
      });
    });

    it('throws ConflictException when email is already taken', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ id: 'existing' });

      await expect(service.register(dto as any)).rejects.toThrow(
        ConflictException,
      );
    });

    it('sets doctor-specific fields only for DOCTOR role', async () => {
      const doctorDto = {
        ...dto,
        role: 'DOCTOR',
        workplace: 'HOSPITAL',
        profession: 'Neurologist',
        title: 'Dr.',
      };

      mockPrisma.user.findUnique.mockResolvedValue(null);
      mockPrisma.user.create.mockResolvedValue({ ...mockUser, role: 'DOCTOR' });
      mockPrisma.userSession.create.mockResolvedValue(mockSession);
      mockPrisma.userSession.update.mockResolvedValue(mockSession);

      await service.register(doctorDto as any);

      expect(mockPrisma.user.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            workplace: 'HOSPITAL',
            profession: 'Neurologist',
            title: 'Dr.',
          }),
        }),
      );
    });

    it('sets workplace/profession/title to null for non-DOCTOR role', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);
      mockPrisma.user.create.mockResolvedValue(mockUser);
      mockPrisma.userSession.create.mockResolvedValue(mockSession);
      mockPrisma.userSession.update.mockResolvedValue(mockSession);

      await service.register(dto as any);

      expect(mockPrisma.user.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            workplace: null,
            profession: null,
            title: null,
          }),
        }),
      );
    });
  });

  // login

  describe('login', () => {
    const mockDbUser = {
      id: 'user-1',
      email: 'test@example.com',
      passwordHash: 'hashed_password',
      firstName: 'John',
      lastName: 'Doe',
      phone: null,
      avatarUrl: null,
      workplace: null,
      profession: null,
      title: null,
      role: 'CAREGIVER',
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    it('returns user and tokens on valid credentials', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(mockDbUser);
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);
      mockPrisma.userSession.create.mockResolvedValue({ id: 'session-1' });
      mockPrisma.userSession.update.mockResolvedValue({});

      const result = await service.login('test@example.com', 'Password123!');

      expect(result.user.email).toBe('test@example.com');
      expect(result.accessToken).toBe('mock_token');
    });

    it('throws UnauthorizedException when user does not exist', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      await expect(
        service.login('nobody@example.com', 'password'),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('throws UnauthorizedException when password is incorrect', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(mockDbUser);
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);

      await expect(
        service.login('test@example.com', 'wrongpass'),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  // getMe

  describe('getMe', () => {
    it('returns the user profile for the given id', async () => {
      const mockUser = { id: 'user-1', email: 'test@example.com' };
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);

      const result = await service.getMe('user-1');

      expect(result).toEqual(mockUser);
      expect(mockPrisma.user.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'user-1' } }),
      );
    });
  });

  // updateMe

  describe('updateMe', () => {
    it('updates and returns the user profile', async () => {
      const updated = { id: 'user-1', firstName: 'Jane' };
      mockPrisma.user.update.mockResolvedValue(updated);

      const result = await service.updateMe('user-1', {
        firstName: 'Jane',
      } as any);

      expect(result).toEqual(updated);
      expect(mockPrisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'user-1' } }),
      );
    });
  });

  // logout

  describe('logout', () => {
    it('deletes the specified session', async () => {
      mockPrisma.userSession.deleteMany.mockResolvedValue({ count: 1 });

      const result = await service.logout('user-1', 'session-1');

      expect(result).toEqual({ success: true });
      expect(mockPrisma.userSession.deleteMany).toHaveBeenCalledWith({
        where: { id: 'session-1', userId: 'user-1' },
      });
    });

    it('deletes all sessions when no sessionId is given', async () => {
      mockPrisma.userSession.deleteMany.mockResolvedValue({ count: 3 });

      const result = await service.logout('user-1');

      expect(result).toEqual({ success: true });
      expect(mockPrisma.userSession.deleteMany).toHaveBeenCalledWith({
        where: { userId: 'user-1' },
      });
    });
  });

  // patientLogin

  describe('patientLogin', () => {
    const deviceInfo = {
      platform: 'ios',
      deviceName: 'iPhone 14',
      deviceId: 'pub-device-123',
    };

    const mockPairing = {
      id: 'pairing-1',
      patientId: 'patient-1',
      patient: { id: 'patient-1', firstName: 'Alice' },
    };
    const mockDevice = { id: 'device-1', patientId: 'patient-1' };

    it('returns patient and tokens for a valid pairing code', async () => {
      mockPrisma.pairingCode.findFirst.mockResolvedValue(mockPairing);
      mockPrisma.device.findUnique.mockResolvedValue(mockDevice);
      mockPrisma.pairingCode.update.mockResolvedValue({});
      mockPrisma.device.update.mockResolvedValue(mockDevice);

      const result = await service.patientLogin('ABC12345', deviceInfo);

      expect(result.patient).toEqual(mockPairing.patient);
      expect(result.accessToken).toBe('mock_token');
      expect(result.deviceId).toBe('device-1');
    });

    it('creates a new device if none exists for the patient+publicId', async () => {
      const newDevice = { id: 'device-new', patientId: 'patient-1' };

      mockPrisma.pairingCode.findFirst.mockResolvedValue(mockPairing);
      mockPrisma.device.findUnique.mockResolvedValue(null);
      mockPrisma.device.create.mockResolvedValue(newDevice);
      mockPrisma.pairingCode.update.mockResolvedValue({});
      mockPrisma.device.update.mockResolvedValue(newDevice);

      await service.patientLogin('ABC12345', deviceInfo);

      expect(mockPrisma.device.create).toHaveBeenCalled();
    });

    it('throws UnauthorizedException for invalid or expired pairing code', async () => {
      mockPrisma.pairingCode.findFirst.mockResolvedValue(null);

      await expect(service.patientLogin('BADCODE', deviceInfo)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('marks the pairing code as used after successful login', async () => {
      mockPrisma.pairingCode.findFirst.mockResolvedValue(mockPairing);
      mockPrisma.device.findUnique.mockResolvedValue(mockDevice);
      mockPrisma.pairingCode.update.mockResolvedValue({});
      mockPrisma.device.update.mockResolvedValue(mockDevice);

      await service.patientLogin('ABC12345', deviceInfo);

      expect(mockPrisma.pairingCode.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'pairing-1' },
          data: expect.objectContaining({ usedAt: expect.any(Date) }),
        }),
      );
    });
  });

  // deviceLogin

  describe('deviceLogin', () => {
    it('returns patient and tokens for a known device', async () => {
      const mockDevice = {
        id: 'device-1',
        patientId: 'patient-1',
        patient: { id: 'patient-1', firstName: 'Alice' },
      };
      mockPrisma.device.findUnique.mockResolvedValue(mockDevice);
      mockPrisma.device.update.mockResolvedValue(mockDevice);

      const result = await service.deviceLogin('device-1');

      expect(result.patient).toEqual(mockDevice.patient);
      expect(result.deviceId).toBe('device-1');
    });

    it('throws UnauthorizedException for an unknown device token', async () => {
      mockPrisma.device.findUnique.mockResolvedValue(null);

      await expect(service.deviceLogin('unknown-device')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('updates lastSeenAt on successful device login', async () => {
      const mockDevice = {
        id: 'device-1',
        patientId: 'patient-1',
        patient: { id: 'patient-1' },
      };
      mockPrisma.device.findUnique.mockResolvedValue(mockDevice);
      mockPrisma.device.update.mockResolvedValue(mockDevice);

      await service.deviceLogin('device-1');

      expect(mockPrisma.device.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'device-1' },
          data: expect.objectContaining({ lastSeenAt: expect.any(Date) }),
        }),
      );
    });
  });
});
