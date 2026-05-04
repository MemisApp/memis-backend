import { Test, TestingModule } from '@nestjs/testing';
import {
  ForbiddenException,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AiOwnerRole, AiMessageRole } from '@prisma/client';

import { AiService } from './ai.service';
import { PrismaService } from '../../prisma/prisma.service';

describe('AiService', () => {
  let service: AiService;

  const mockPrisma = {
    doctorPatient: { findUnique: jest.fn() },
    patientCaregiver: { findUnique: jest.fn() },
    contact: { findMany: jest.fn() },
    anamneze: { findMany: jest.fn() },
    mMSETest: { findMany: jest.fn() },
    treatment: { findMany: jest.fn() },
    aiConversation: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    aiConversationMessage: {
      findMany: jest.fn(),
      create: jest.fn(),
    },
    $transaction: jest.fn(),
  };

  const mockConfig = {
    get: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AiService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: ConfigService, useValue: mockConfig },
      ],
    }).compile();

    service = module.get<AiService>(AiService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // Shared helpers
  const USER_ID = 'user-1';
  const PATIENT_ID = 'patient-1';
  const CONV_ID = 'conv-1';

  const makeMessages = (text = 'Hello') => [{ role: 'user' as const, content: text }];

  const emptyClinical = () => {
    mockPrisma.anamneze.findMany.mockResolvedValue([]);
    mockPrisma.mMSETest.findMany.mockResolvedValue([]);
    mockPrisma.treatment.findMany.mockResolvedValue([]);
  };

  // createStreamContext

  describe('createStreamContext', () => {
    it('throws InternalServerErrorException when GEMINI_API_KEY is missing', async () => {
      mockConfig.get.mockReturnValue(undefined);

      await expect(
        service.createStreamContext(USER_ID, 'CAREGIVER', {
          messages: makeMessages(),
        } as any),
      ).rejects.toThrow(InternalServerErrorException);
    });

    it('returns stream context with API key and system instruction', async () => {
      mockConfig.get.mockReturnValue('test-api-key');
      mockPrisma.patientCaregiver.findUnique.mockResolvedValue({ role: 'OWNER' });
      mockPrisma.contact.findMany.mockResolvedValue([]);
      emptyClinical();

      const dto = {
        messages: makeMessages('Tell me about medication'),
        patientId: PATIENT_ID,
      };

      const result = await service.createStreamContext(USER_ID, 'CAREGIVER', dto as any);

      expect(result.geminiApiKey).toBe('test-api-key');
      expect(result.systemInstruction).toContain('MemiMinds');
      expect(result.messages).toEqual(dto.messages);
      expect(result.lastUserMessage).toBe('Tell me about medication');
    });

    it('uses userId as patientId when the caller role is PATIENT', async () => {
      mockConfig.get.mockReturnValue('test-api-key');
      mockPrisma.contact.findMany.mockResolvedValue([]);
      emptyClinical();

      const dto = { messages: makeMessages() };

      const result = await service.createStreamContext(USER_ID, 'PATIENT', dto as any);

      // No caregiver / doctor link lookup needed for PATIENT role
      expect(mockPrisma.patientCaregiver.findUnique).not.toHaveBeenCalled();
      expect(result.geminiApiKey).toBe('test-api-key');
    });

    it('throws ForbiddenException when a CAREGIVER has no access to the requested patient', async () => {
      mockConfig.get.mockReturnValue('test-api-key');
      mockPrisma.patientCaregiver.findUnique.mockResolvedValue(null);

      const dto = { messages: makeMessages(), patientId: PATIENT_ID };

      await expect(
        service.createStreamContext(USER_ID, 'CAREGIVER', dto as any),
      ).rejects.toThrow(ForbiddenException);
    });

    it('includes matched contacts in the result when names appear in user message', async () => {
      mockConfig.get.mockReturnValue('test-api-key');
      mockPrisma.patientCaregiver.findUnique.mockResolvedValue({ role: 'OWNER' });
      const mockContacts = [
        {
          id: 'c-1',
          name: 'Alice Johnson',
          description: 'Sister',
          photoUrl: null,
          phone: '+1234567890',
        },
      ];
      mockPrisma.contact.findMany.mockResolvedValue(mockContacts);
      emptyClinical();

      const dto = {
        messages: [{ role: 'user', content: 'What is Alice Johnson phone?' }],
        patientId: PATIENT_ID,
      };

      const result = await service.createStreamContext(USER_ID, 'CAREGIVER', dto as any);

      expect(result.matchedContacts).toHaveLength(1);
      expect(result.matchedContacts[0].name).toBe('Alice Johnson');
    });

    it('returns no matched contacts when no name appears in user message', async () => {
      mockConfig.get.mockReturnValue('test-api-key');
      mockPrisma.patientCaregiver.findUnique.mockResolvedValue({ role: 'OWNER' });
      mockPrisma.contact.findMany.mockResolvedValue([
        { id: 'c-1', name: 'Alice Johnson', description: null, photoUrl: null, phone: null },
      ]);
      emptyClinical();

      const dto = {
        messages: makeMessages('What is Alzheimer disease?'),
        patientId: PATIENT_ID,
      };

      const result = await service.createStreamContext(USER_ID, 'CAREGIVER', dto as any);

      expect(result.matchedContacts).toHaveLength(0);
    });

    it('includes clinical summary in system instruction when patient has data', async () => {
      mockConfig.get.mockReturnValue('test-api-key');
      mockPrisma.patientCaregiver.findUnique.mockResolvedValue({ role: 'OWNER' });
      mockPrisma.contact.findMany.mockResolvedValue([]);
      mockPrisma.anamneze.findMany.mockResolvedValue([
        { content: 'Memory loss onset 2022', updatedAt: new Date() },
      ]);
      mockPrisma.mMSETest.findMany.mockResolvedValue([]);
      mockPrisma.treatment.findMany.mockResolvedValue([]);

      const dto = { messages: makeMessages(), patientId: PATIENT_ID };

      const result = await service.createStreamContext(USER_ID, 'CAREGIVER', dto as any);

      expect(result.systemInstruction).toContain('Memory loss onset 2022');
    });

    it('sets lastUserMessage to empty string when no user message is present', async () => {
      mockConfig.get.mockReturnValue('test-api-key');
      // No patientId so no patient context lookup
      const dto = { messages: [{ role: 'assistant', content: 'Hello' }] };

      const result = await service.createStreamContext(USER_ID, 'CAREGIVER', dto as any);

      expect(result.lastUserMessage).toBe('');
    });
  });

  // upsertConversation

  describe('upsertConversation', () => {
    it('creates a new conversation when no conversationId is provided', async () => {
      mockPrisma.patientCaregiver.findUnique.mockResolvedValue({ role: 'OWNER' });
      mockPrisma.aiConversation.create.mockResolvedValue({
        id: CONV_ID,
        patientId: PATIENT_ID,
      });

      const dto = {
        messages: makeMessages('First message'),
        patientId: PATIENT_ID,
      };

      const result = await service.upsertConversation(USER_ID, 'CAREGIVER', dto as any);

      expect(result.id).toBe(CONV_ID);
      expect(mockPrisma.aiConversation.create).toHaveBeenCalled();
    });

    it('returns existing conversation when a valid conversationId is provided', async () => {
      mockPrisma.patientCaregiver.findUnique.mockResolvedValue({ role: 'OWNER' });
      mockPrisma.aiConversation.findFirst.mockResolvedValue({
        id: CONV_ID,
        patientId: PATIENT_ID,
      });

      const dto = {
        messages: makeMessages(),
        conversationId: CONV_ID,
        patientId: PATIENT_ID,
      };

      const result = await service.upsertConversation(USER_ID, 'CAREGIVER', dto as any);

      expect(result.id).toBe(CONV_ID);
      expect(mockPrisma.aiConversation.create).not.toHaveBeenCalled();
    });

    it('throws NotFoundException when conversationId does not belong to user', async () => {
      mockPrisma.patientCaregiver.findUnique.mockResolvedValue({ role: 'OWNER' });
      mockPrisma.aiConversation.findFirst.mockResolvedValue(null);

      const dto = {
        messages: makeMessages(),
        conversationId: 'bad-conv',
        patientId: PATIENT_ID,
      };

      await expect(
        service.upsertConversation(USER_ID, 'CAREGIVER', dto as any),
      ).rejects.toThrow(NotFoundException);
    });

    it('truncates the conversation title to 80 characters', async () => {
      mockPrisma.aiConversation.create.mockResolvedValue({
        id: CONV_ID,
        patientId: null,
      });

      const longMessage = 'A'.repeat(120);
      const dto = { messages: [{ role: 'user', content: longMessage }] };

      await service.upsertConversation(USER_ID, 'CAREGIVER', dto as any);

      expect(mockPrisma.aiConversation.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            title: 'A'.repeat(80),
          }),
        }),
      );
    });

    it('maps role PATIENT → AiOwnerRole.PATIENT', async () => {
      mockPrisma.aiConversation.create.mockResolvedValue({
        id: CONV_ID,
        patientId: USER_ID,
      });

      const dto = { messages: makeMessages() };

      await service.upsertConversation(USER_ID, 'PATIENT', dto as any);

      expect(mockPrisma.aiConversation.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ ownerRole: AiOwnerRole.PATIENT }),
        }),
      );
    });

    it('maps unknown role → AiOwnerRole.CAREGIVER', async () => {
      mockPrisma.aiConversation.create.mockResolvedValue({
        id: CONV_ID,
        patientId: null,
      });

      const dto = { messages: makeMessages() };

      await service.upsertConversation(USER_ID, 'CAREGIVER', dto as any);

      expect(mockPrisma.aiConversation.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ ownerRole: AiOwnerRole.CAREGIVER }),
        }),
      );
    });
  });

  // saveExchange

  describe('saveExchange', () => {
    beforeEach(() => {
      mockPrisma.$transaction.mockImplementation(
        (cb: (tx: typeof mockPrisma) => Promise<unknown>) => cb(mockPrisma),
      );
      mockPrisma.aiConversationMessage.create.mockResolvedValue({});
      mockPrisma.aiConversation.update.mockResolvedValue({});
    });

    it('saves user and assistant messages in a transaction', async () => {
      await service.saveExchange(CONV_ID, 'Hello', 'Hi there', []);

      expect(mockPrisma.aiConversationMessage.create).toHaveBeenCalledTimes(2);
      expect(mockPrisma.aiConversationMessage.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ role: AiMessageRole.USER }),
        }),
      );
      expect(mockPrisma.aiConversationMessage.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ role: AiMessageRole.ASSISTANT }),
        }),
      );
    });

    it('does nothing when both texts are empty', async () => {
      await service.saveExchange(CONV_ID, '  ', '  ', []);

      expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    });

    it('saves only the user message when assistant text is empty', async () => {
      await service.saveExchange(CONV_ID, 'Hello', '', []);

      expect(mockPrisma.aiConversationMessage.create).toHaveBeenCalledTimes(1);
      expect(mockPrisma.aiConversationMessage.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ role: AiMessageRole.USER }),
        }),
      );
    });

    it('attaches contact snapshot to assistant message when contacts are provided', async () => {
      const contacts = [{ id: 'c-1', name: 'Alice' }] as any;

      await service.saveExchange(CONV_ID, 'Hello', 'Hi', contacts);

      expect(mockPrisma.aiConversationMessage.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            contactSnapshot: contacts,
            role: AiMessageRole.ASSISTANT,
          }),
        }),
      );
    });
  });

  // listConversations

  describe('listConversations', () => {
    it('returns conversations owned by the user with correct role filter', async () => {
      const mockConvs = [{ id: CONV_ID, title: 'Chat 1' }];
      mockPrisma.aiConversation.findMany.mockResolvedValue(mockConvs);

      const result = await service.listConversations(USER_ID, 'CAREGIVER');

      expect(result).toEqual(mockConvs);
      expect(mockPrisma.aiConversation.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            ownerId: USER_ID,
            ownerRole: AiOwnerRole.CAREGIVER,
          }),
        }),
      );
    });

    it('adds patientId filter when patientId is provided', async () => {
      mockPrisma.aiConversation.findMany.mockResolvedValue([]);

      await service.listConversations(USER_ID, 'CAREGIVER', PATIENT_ID);

      expect(mockPrisma.aiConversation.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ patientId: PATIENT_ID }),
        }),
      );
    });
  });

  // getConversationMessages

  describe('getConversationMessages', () => {
    it('returns messages for a valid conversation', async () => {
      const mockMsgs = [{ id: 'msg-1', role: 'USER', content: 'Hello' }];
      mockPrisma.aiConversation.findFirst.mockResolvedValue({ id: CONV_ID });
      mockPrisma.aiConversationMessage.findMany.mockResolvedValue(mockMsgs);

      const result = await service.getConversationMessages(
        USER_ID,
        'CAREGIVER',
        CONV_ID,
      );

      expect(result).toEqual(mockMsgs);
    });

    it('throws NotFoundException when conversation does not belong to user', async () => {
      mockPrisma.aiConversation.findFirst.mockResolvedValue(null);

      await expect(
        service.getConversationMessages(USER_ID, 'CAREGIVER', 'bad-conv'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // deleteConversation

  describe('deleteConversation', () => {
    it('deletes the conversation and returns success', async () => {
      mockPrisma.aiConversation.findFirst.mockResolvedValue({ id: CONV_ID });
      mockPrisma.aiConversation.delete.mockResolvedValue({});

      const result = await service.deleteConversation(
        USER_ID,
        'CAREGIVER',
        CONV_ID,
      );

      expect(result).toEqual({ success: true });
      expect(mockPrisma.aiConversation.delete).toHaveBeenCalledWith({
        where: { id: CONV_ID },
      });
    });

    it('throws NotFoundException when conversation does not belong to user', async () => {
      mockPrisma.aiConversation.findFirst.mockResolvedValue(null);

      await expect(
        service.deleteConversation(USER_ID, 'CAREGIVER', 'bad-conv'),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
