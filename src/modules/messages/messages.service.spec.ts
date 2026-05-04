import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Role } from '@prisma/client';

import { MessagesService } from './messages.service';
import { PrismaService } from '../../prisma/prisma.service';
import { PushService } from '../clinical/push.service';

describe('MessagesService', () => {
  let service: MessagesService;

  const mockPrisma = {
    thread: { findUnique: jest.fn() },
    message: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      count: jest.fn(),
    },
    roomMember: { findUnique: jest.fn() },
    room: { findUnique: jest.fn() },
    appNotification: { create: jest.fn() },
  };

  const mockPushService = {
    sendToPatient: jest.fn().mockResolvedValue(undefined),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MessagesService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: PushService, useValue: mockPushService },
      ],
    }).compile();

    service = module.get<MessagesService>(MessagesService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  const USER_ID = 'user-1';
  const THREAD_ID = 'thread-1';
  const ROOM_ID = 'room-1';
  const MESSAGE_ID = 'message-1';

  const publicThread = {
    id: THREAD_ID,
    roomId: ROOM_ID,
    room: { visibility: 'PUBLIC' },
  };

  const privateThread = {
    id: THREAD_ID,
    roomId: ROOM_ID,
    room: { visibility: 'PRIVATE' },
  };

  const threadWithRoomId = { id: THREAD_ID, roomId: ROOM_ID };

  const mockMessage = {
    id: MESSAGE_ID,
    content: 'Hello world',
    threadId: THREAD_ID,
    authorId: USER_ID,
    editedAt: null,
    createdAt: new Date(),
  };

  // listByThread

  describe('listByThread', () => {
    it('returns paginated messages for a PUBLIC thread without membership check', async () => {
      mockPrisma.thread.findUnique.mockResolvedValue(publicThread);
      mockPrisma.message.findMany.mockResolvedValue([mockMessage]);
      mockPrisma.message.count.mockResolvedValue(1);

      const result = await service.listByThread(USER_ID, THREAD_ID);

      expect(result.items).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(mockPrisma.roomMember.findUnique).not.toHaveBeenCalled();
    });

    it('returns messages for a PRIVATE thread when user is a member', async () => {
      mockPrisma.thread.findUnique.mockResolvedValue(privateThread);
      mockPrisma.roomMember.findUnique.mockResolvedValue({ role: 'MEMBER' });
      mockPrisma.message.findMany.mockResolvedValue([mockMessage]);
      mockPrisma.message.count.mockResolvedValue(1);

      const result = await service.listByThread(USER_ID, THREAD_ID);

      expect(result.items).toHaveLength(1);
    });

    it('throws ForbiddenException for a PRIVATE thread when user is not a member', async () => {
      mockPrisma.thread.findUnique.mockResolvedValue(privateThread);
      mockPrisma.roomMember.findUnique.mockResolvedValue(null);

      await expect(
        service.listByThread(USER_ID, THREAD_ID),
      ).rejects.toThrow(ForbiddenException);
    });

    it('throws NotFoundException when thread does not exist', async () => {
      mockPrisma.thread.findUnique.mockResolvedValue(null);

      await expect(
        service.listByThread(USER_ID, THREAD_ID),
      ).rejects.toThrow(NotFoundException);
    });

    it('applies pagination correctly', async () => {
      mockPrisma.thread.findUnique.mockResolvedValue(publicThread);
      mockPrisma.message.findMany.mockResolvedValue([]);
      mockPrisma.message.count.mockResolvedValue(0);

      const result = await service.listByThread(USER_ID, THREAD_ID, 3, 10);

      expect(result.page).toBe(3);
      expect(result.pageSize).toBe(10);
      expect(mockPrisma.message.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 20, take: 10 }),
      );
    });
  });

  // createInThread

  describe('createInThread', () => {
    const createDto = { content: 'Hello!' };

    beforeEach(() => {
      mockPrisma.room.findUnique.mockResolvedValue({ patientId: null, name: 'Room' });
    });

    it('creates a message in a PUBLIC thread without membership check', async () => {
      mockPrisma.thread.findUnique.mockResolvedValue(publicThread);
      mockPrisma.message.create.mockResolvedValue({
        ...mockMessage,
        author: { id: USER_ID, firstName: 'John', lastName: 'Doe', avatarUrl: null, role: 'CAREGIVER' },
      });

      const result = await service.createInThread(USER_ID, THREAD_ID, createDto as any);

      expect(result.content).toBe('Hello world');
      expect(mockPrisma.roomMember.findUnique).not.toHaveBeenCalled();
    });

    it('creates a message in a PRIVATE thread when user is a member', async () => {
      mockPrisma.thread.findUnique.mockResolvedValue(privateThread);
      mockPrisma.roomMember.findUnique.mockResolvedValue({ role: 'MEMBER' });
      mockPrisma.message.create.mockResolvedValue({
        ...mockMessage,
        author: { id: USER_ID, firstName: 'John', lastName: 'Doe', avatarUrl: null, role: 'CAREGIVER' },
      });

      const result = await service.createInThread(USER_ID, THREAD_ID, createDto as any);

      expect(result).toBeDefined();
    });

    it('throws ForbiddenException for PRIVATE thread when user is not a member', async () => {
      mockPrisma.thread.findUnique.mockResolvedValue(privateThread);
      mockPrisma.roomMember.findUnique.mockResolvedValue(null);

      await expect(
        service.createInThread(USER_ID, THREAD_ID, createDto as any),
      ).rejects.toThrow(ForbiddenException);
    });

    it('throws NotFoundException when thread does not exist', async () => {
      mockPrisma.thread.findUnique.mockResolvedValue(null);

      await expect(
        service.createInThread(USER_ID, THREAD_ID, createDto as any),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws BadRequestException when content is blank after trim', async () => {
      mockPrisma.thread.findUnique.mockResolvedValue(publicThread);

      await expect(
        service.createInThread(USER_ID, THREAD_ID, { content: '   ' } as any),
      ).rejects.toThrow(BadRequestException);
    });

    it('trims whitespace from content before saving', async () => {
      mockPrisma.thread.findUnique.mockResolvedValue(publicThread);
      mockPrisma.message.create.mockResolvedValue({
        ...mockMessage,
        content: 'trimmed',
        author: { id: USER_ID, firstName: 'J', lastName: 'D', avatarUrl: null, role: 'CAREGIVER' },
      });

      await service.createInThread(USER_ID, THREAD_ID, { content: '  trimmed  ' } as any);

      expect(mockPrisma.message.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ content: 'trimmed' }),
        }),
      );
    });

    it('sends push notification when room is linked to a patient', async () => {
      mockPrisma.thread.findUnique.mockResolvedValue(publicThread);
      mockPrisma.message.create.mockResolvedValue({
        ...mockMessage,
        author: { id: USER_ID, firstName: 'John', lastName: 'Doe', avatarUrl: null, role: 'CAREGIVER' },
      });
      mockPrisma.room.findUnique.mockResolvedValue({
        patientId: 'patient-1',
        name: 'Care Room',
      });
      mockPrisma.appNotification.create.mockResolvedValue({});

      await service.createInThread(USER_ID, THREAD_ID, { content: 'Hi' } as any);

      await new Promise((r) => setImmediate(r));

      expect(mockPushService.sendToPatient).toHaveBeenCalledWith(
        'patient-1',
        expect.stringContaining('sent a message'),
        'Hi',
        expect.any(Object),
      );
    });
  });

  // getById

  describe('getById', () => {
    it('returns a message from a PUBLIC thread without membership check', async () => {
      mockPrisma.message.findUnique.mockResolvedValue(mockMessage);
      mockPrisma.thread.findUnique.mockResolvedValue(publicThread);

      const result = await service.getById(USER_ID, MESSAGE_ID);

      expect(result).toEqual(mockMessage);
      expect(mockPrisma.roomMember.findUnique).not.toHaveBeenCalled();
    });

    it('returns a message from a PRIVATE thread when user is a member', async () => {
      mockPrisma.message.findUnique.mockResolvedValue(mockMessage);
      mockPrisma.thread.findUnique.mockResolvedValue(privateThread);
      mockPrisma.roomMember.findUnique.mockResolvedValue({ role: 'MEMBER' });

      const result = await service.getById(USER_ID, MESSAGE_ID);

      expect(result).toEqual(mockMessage);
    });

    it('throws ForbiddenException for PRIVATE thread when not a member', async () => {
      mockPrisma.message.findUnique.mockResolvedValue(mockMessage);
      mockPrisma.thread.findUnique.mockResolvedValue(privateThread);
      mockPrisma.roomMember.findUnique.mockResolvedValue(null);

      await expect(service.getById(USER_ID, MESSAGE_ID)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('throws NotFoundException when message does not exist', async () => {
      mockPrisma.message.findUnique.mockResolvedValue(null);

      await expect(service.getById(USER_ID, MESSAGE_ID)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('throws NotFoundException when thread is missing for the message', async () => {
      mockPrisma.message.findUnique.mockResolvedValue(mockMessage);
      mockPrisma.thread.findUnique.mockResolvedValue(null);

      await expect(service.getById(USER_ID, MESSAGE_ID)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // updateById

  describe('updateById', () => {
    const updateDto = { content: 'Updated content' };

    it('allows the message author to update their message', async () => {
      mockPrisma.message.findUnique.mockResolvedValue(mockMessage); // authorId === USER_ID
      mockPrisma.thread.findUnique.mockResolvedValue(threadWithRoomId);
      mockPrisma.roomMember.findUnique.mockResolvedValue(null); // not a room mod
      mockPrisma.message.update.mockResolvedValue({
        ...mockMessage,
        content: 'Updated content',
        editedAt: new Date(),
      });

      const result = await service.updateById(
        USER_ID,
        Role.CAREGIVER,
        MESSAGE_ID,
        updateDto as any,
      );

      expect(result.content).toBe('Updated content');
    });

    it('allows an ADMIN to update any message', async () => {
      const otherUserMessage = { ...mockMessage, authorId: 'someone-else' };
      mockPrisma.message.findUnique.mockResolvedValue(otherUserMessage);
      mockPrisma.thread.findUnique.mockResolvedValue(threadWithRoomId);
      mockPrisma.roomMember.findUnique.mockResolvedValue(null);
      mockPrisma.message.update.mockResolvedValue({
        ...otherUserMessage,
        content: 'Admin updated',
      });

      const result = await service.updateById(
        'admin-id',
        Role.ADMIN,
        MESSAGE_ID,
        { content: 'Admin updated' } as any,
      );

      expect(result.content).toBe('Admin updated');
    });

    it('allows a room OWNER to update any message in their room', async () => {
      const otherUserMessage = { ...mockMessage, authorId: 'someone-else' };
      mockPrisma.message.findUnique.mockResolvedValue(otherUserMessage);
      mockPrisma.thread.findUnique.mockResolvedValue(threadWithRoomId);
      mockPrisma.roomMember.findUnique.mockResolvedValue({ role: 'OWNER' });
      mockPrisma.message.update.mockResolvedValue({
        ...otherUserMessage,
        content: 'Owner updated',
      });

      const result = await service.updateById(
        USER_ID,
        Role.CAREGIVER,
        MESSAGE_ID,
        { content: 'Owner updated' } as any,
      );

      expect(result.content).toBe('Owner updated');
    });

    it('allows a room MODERATOR to update any message in their room', async () => {
      const otherUserMessage = { ...mockMessage, authorId: 'someone-else' };
      mockPrisma.message.findUnique.mockResolvedValue(otherUserMessage);
      mockPrisma.thread.findUnique.mockResolvedValue(threadWithRoomId);
      mockPrisma.roomMember.findUnique.mockResolvedValue({ role: 'MODERATOR' });
      mockPrisma.message.update.mockResolvedValue({
        ...otherUserMessage,
        content: 'Mod updated',
      });

      await service.updateById(
        USER_ID,
        Role.CAREGIVER,
        MESSAGE_ID,
        { content: 'Mod updated' } as any,
      );

      expect(mockPrisma.message.update).toHaveBeenCalled();
    });

    it('throws ForbiddenException when user is not author, mod, or admin', async () => {
      const otherUserMessage = { ...mockMessage, authorId: 'someone-else' };
      mockPrisma.message.findUnique.mockResolvedValue(otherUserMessage);
      mockPrisma.thread.findUnique.mockResolvedValue(threadWithRoomId);
      mockPrisma.roomMember.findUnique.mockResolvedValue({ role: 'MEMBER' });

      await expect(
        service.updateById(USER_ID, Role.CAREGIVER, MESSAGE_ID, updateDto as any),
      ).rejects.toThrow(ForbiddenException);
    });

    it('throws BadRequestException when updated content is blank after trim', async () => {
      mockPrisma.message.findUnique.mockResolvedValue(mockMessage);
      mockPrisma.thread.findUnique.mockResolvedValue(threadWithRoomId);
      mockPrisma.roomMember.findUnique.mockResolvedValue(null);

      await expect(
        service.updateById(USER_ID, Role.CAREGIVER, MESSAGE_ID, { content: '   ' } as any),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws NotFoundException when message does not exist', async () => {
      mockPrisma.message.findUnique.mockResolvedValue(null);

      await expect(
        service.updateById(USER_ID, Role.CAREGIVER, MESSAGE_ID, updateDto as any),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws NotFoundException when thread is missing', async () => {
      mockPrisma.message.findUnique.mockResolvedValue(mockMessage);
      mockPrisma.thread.findUnique.mockResolvedValue(null);

      await expect(
        service.updateById(USER_ID, Role.CAREGIVER, MESSAGE_ID, updateDto as any),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // deleteById

  describe('deleteById', () => {
    it('allows the message author to delete their own message', async () => {
      mockPrisma.message.findUnique.mockResolvedValue(mockMessage);
      mockPrisma.thread.findUnique.mockResolvedValue(threadWithRoomId);
      mockPrisma.roomMember.findUnique.mockResolvedValue(null);
      mockPrisma.message.delete.mockResolvedValue({});

      const result = await service.deleteById(USER_ID, Role.CAREGIVER, MESSAGE_ID);

      expect(result).toEqual({ ok: true });
      expect(mockPrisma.message.delete).toHaveBeenCalledWith({
        where: { id: MESSAGE_ID },
      });
    });

    it('allows an ADMIN to delete any message', async () => {
      const otherUserMessage = { ...mockMessage, authorId: 'someone-else' };
      mockPrisma.message.findUnique.mockResolvedValue(otherUserMessage);
      mockPrisma.thread.findUnique.mockResolvedValue(threadWithRoomId);
      mockPrisma.roomMember.findUnique.mockResolvedValue(null);
      mockPrisma.message.delete.mockResolvedValue({});

      const result = await service.deleteById('admin-id', Role.ADMIN, MESSAGE_ID);

      expect(result).toEqual({ ok: true });
    });

    it('allows a room OWNER to delete any message in their room', async () => {
      const otherUserMessage = { ...mockMessage, authorId: 'someone-else' };
      mockPrisma.message.findUnique.mockResolvedValue(otherUserMessage);
      mockPrisma.thread.findUnique.mockResolvedValue(threadWithRoomId);
      mockPrisma.roomMember.findUnique.mockResolvedValue({ role: 'OWNER' });
      mockPrisma.message.delete.mockResolvedValue({});

      const result = await service.deleteById(USER_ID, Role.CAREGIVER, MESSAGE_ID);

      expect(result).toEqual({ ok: true });
    });

    it('throws ForbiddenException when user is a plain MEMBER trying to delete others messages', async () => {
      const otherUserMessage = { ...mockMessage, authorId: 'someone-else' };
      mockPrisma.message.findUnique.mockResolvedValue(otherUserMessage);
      mockPrisma.thread.findUnique.mockResolvedValue(threadWithRoomId);
      mockPrisma.roomMember.findUnique.mockResolvedValue({ role: 'MEMBER' });

      await expect(
        service.deleteById(USER_ID, Role.CAREGIVER, MESSAGE_ID),
      ).rejects.toThrow(ForbiddenException);
    });

    it('throws NotFoundException when message does not exist', async () => {
      mockPrisma.message.findUnique.mockResolvedValue(null);

      await expect(
        service.deleteById(USER_ID, Role.CAREGIVER, MESSAGE_ID),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws NotFoundException when thread is missing', async () => {
      mockPrisma.message.findUnique.mockResolvedValue(mockMessage);
      mockPrisma.thread.findUnique.mockResolvedValue(null);

      await expect(
        service.deleteById(USER_ID, Role.CAREGIVER, MESSAGE_ID),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
