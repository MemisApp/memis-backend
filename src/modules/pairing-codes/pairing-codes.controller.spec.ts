import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException, NotFoundException } from '@nestjs/common';

import { PairingCodesController } from './pairing-codes.controller';
import { PatientsService } from '../patients/patients.service';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';

describe('PairingCodesController', () => {
  let controller: PairingCodesController;

  const mockPatientsService = {
    revokePairingCode: jest.fn(),
  };

  const allowAllGuard = { canActivate: jest.fn().mockReturnValue(true) };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [PairingCodesController],
      providers: [
        { provide: PatientsService, useValue: mockPatientsService },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue(allowAllGuard)
      .compile();

    controller = module.get<PairingCodesController>(PairingCodesController);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  const makeReq = (userId = 'user-1', role = 'CAREGIVER') =>
    ({ user: { id: userId, role } } as any);

  // revokePairingCode

  describe('revokePairingCode', () => {
    it('delegates to PatientsService and returns success', async () => {
      mockPatientsService.revokePairingCode.mockResolvedValue({ success: true });

      const result = await controller.revokePairingCode(makeReq(), 'code-1');

      expect(result).toEqual({ success: true });
      expect(mockPatientsService.revokePairingCode).toHaveBeenCalledWith(
        'code-1',
        'user-1',
      );
    });

    it('passes the authenticated user id from the request', async () => {
      mockPatientsService.revokePairingCode.mockResolvedValue({ success: true });

      await controller.revokePairingCode(makeReq('caregiver-42'), 'code-abc');

      expect(mockPatientsService.revokePairingCode).toHaveBeenCalledWith(
        'code-abc',
        'caregiver-42',
      );
    });

    it('propagates NotFoundException from PatientsService', async () => {
      mockPatientsService.revokePairingCode.mockRejectedValue(
        new NotFoundException('Pairing code not found'),
      );

      await expect(
        controller.revokePairingCode(makeReq(), 'nonexistent-code'),
      ).rejects.toThrow(NotFoundException);
    });

    it('propagates ForbiddenException from PatientsService', async () => {
      mockPatientsService.revokePairingCode.mockRejectedValue(
        new ForbiddenException('No access to this pairing code'),
      );

      await expect(
        controller.revokePairingCode(makeReq('other-user'), 'code-1'),
      ).rejects.toThrow(ForbiddenException);
    });
  });
});
