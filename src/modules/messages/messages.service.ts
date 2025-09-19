import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateMessageDto } from './dto/create-message.dto';
import { UpdateMessageDto } from './dto/update-message.dto';
import { Role } from '@prisma/client';

@Injectable()
export class MessagesService {
  constructor(private prisma: PrismaService) {}

  async listByThread(
    userId: string,
    threadId: string,
    page: number = 1,
    pageSize: number = 50,
  ) {
    // Load thread → roomId and room visibility
    const thread = await this.getThreadWithRoomVisibility(threadId);
    if (!thread) {
      throw new NotFoundException('THREAD_NOT_FOUND');
    }

    // Allow access to messages in public rooms for everyone
    if (thread.room.visibility === 'PUBLIC') {
      // Continue to fetch messages
    } else {
      // For private rooms, check membership
      const isMember = await this.isRoomMember(userId, thread.roomId);
      if (!isMember) {
        throw new ForbiddenException('NOT_ROOM_MEMBER');
      }
    }

    const skip = (page - 1) * pageSize;

    const [items, total] = await Promise.all([
      this.prisma.message.findMany({
        where: { threadId },
        select: {
          id: true,
          content: true,
          threadId: true,
          authorId: true,
          editedAt: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'asc' },
        skip,
        take: pageSize,
      }),
      this.prisma.message.count({
        where: { threadId },
      }),
    ]);

    return {
      items,
      page,
      pageSize,
      total,
    };
  }

  async createInThread(
    userId: string,
    threadId: string,
    dto: CreateMessageDto,
  ) {
    // Load thread → roomId and room visibility
    const thread = await this.getThreadWithRoomVisibility(threadId);
    if (!thread) {
      throw new NotFoundException('THREAD_NOT_FOUND');
    }

    // Allow message creation in public rooms for everyone
    if (thread.room.visibility === 'PUBLIC') {
      // Continue to create message
    } else {
      // For private rooms, check membership
      const isMember = await this.isRoomMember(userId, thread.roomId);
      if (!isMember) {
        throw new ForbiddenException('NOT_ROOM_MEMBER');
      }
    }

    // Trim content and validate
    const trimmedContent = dto.content.trim();
    if (!trimmedContent) {
      throw new BadRequestException('EMPTY_CONTENT');
    }

    return this.prisma.message.create({
      data: {
        threadId,
        authorId: userId,
        content: trimmedContent,
      },
      select: {
        id: true,
        content: true,
        threadId: true,
        authorId: true,
        editedAt: true,
        createdAt: true,
      },
    });
  }

  async getById(userId: string, messageId: string) {
    // Load message → threadId → roomId
    const message = await this.prisma.message.findUnique({
      where: { id: messageId },
      select: {
        id: true,
        content: true,
        threadId: true,
        authorId: true,
        editedAt: true,
        createdAt: true,
      },
    });

    if (!message) {
      throw new NotFoundException('MESSAGE_NOT_FOUND');
    }

    // Load thread to get roomId and room visibility
    const thread = await this.getThreadWithRoomVisibility(message.threadId);
    if (!thread) {
      throw new NotFoundException('THREAD_NOT_FOUND');
    }

    // Allow access to messages in public rooms for everyone
    if (thread.room.visibility === 'PUBLIC') {
      return message;
    }

    // For private rooms, check membership
    const isMember = await this.isRoomMember(userId, thread.roomId);
    if (!isMember) {
      throw new ForbiddenException('NOT_ROOM_MEMBER');
    }

    return message;
  }

  async updateById(
    userId: string,
    userRole: string,
    messageId: string,
    dto: UpdateMessageDto,
  ) {
    // Load message (authorId) → thread → roomId
    const message = await this.prisma.message.findUnique({
      where: { id: messageId },
      select: {
        id: true,
        content: true,
        authorId: true,
        threadId: true,
      },
    });

    if (!message) {
      throw new NotFoundException('MESSAGE_NOT_FOUND');
    }

    // Load thread to get roomId
    const thread = await this.getThreadWithRoomId(message.threadId);
    if (!thread) {
      throw new NotFoundException('THREAD_NOT_FOUND');
    }

    // Authorize: author OR room OWNER/MODERATOR OR ADMIN
    const isAuthor = message.authorId === userId;
    const roomRole = await this.getRoomMemberRole(userId, thread.roomId);
    const canModerate = this.canModerate(roomRole);
    const isAdmin = userRole === Role.ADMIN;

    if (!isAuthor && !canModerate && !isAdmin) {
      throw new ForbiddenException('INSUFFICIENT_PRIVILEGES');
    }

    // Validate content if provided
    let trimmedContent = dto.content;
    if (dto.content !== undefined) {
      trimmedContent = dto.content.trim();
      if (!trimmedContent) {
        throw new BadRequestException('EMPTY_CONTENT');
      }
    }

    return this.prisma.message.update({
      where: { id: messageId },
      data: {
        ...(dto.content !== undefined && { content: trimmedContent }),
        ...(dto.content !== undefined && { editedAt: new Date() }),
      },
      select: {
        id: true,
        content: true,
        threadId: true,
        authorId: true,
        editedAt: true,
        createdAt: true,
      },
    });
  }

  async deleteById(userId: string, userRole: string, messageId: string) {
    // Load message (authorId) → thread → roomId
    const message = await this.prisma.message.findUnique({
      where: { id: messageId },
      select: {
        id: true,
        authorId: true,
        threadId: true,
      },
    });

    if (!message) {
      throw new NotFoundException('MESSAGE_NOT_FOUND');
    }

    // Load thread to get roomId
    const thread = await this.getThreadWithRoomId(message.threadId);
    if (!thread) {
      throw new NotFoundException('THREAD_NOT_FOUND');
    }

    // Authorize: author OR room OWNER/MODERATOR OR ADMIN
    const isAuthor = message.authorId === userId;
    const roomRole = await this.getRoomMemberRole(userId, thread.roomId);
    const canModerate = this.canModerate(roomRole);
    const isAdmin = userRole === Role.ADMIN;

    if (!isAuthor && !canModerate && !isAdmin) {
      throw new ForbiddenException('INSUFFICIENT_PRIVILEGES');
    }

    await this.prisma.message.delete({
      where: { id: messageId },
    });

    return { ok: true };
  }

  private async getThreadWithRoomId(
    threadId: string,
  ): Promise<{ id: string; roomId: string } | null> {
    const thread = await this.prisma.thread.findUnique({
      where: { id: threadId },
      select: {
        id: true,
        roomId: true,
      },
    });

    return thread;
  }

  private async getThreadWithRoomVisibility(threadId: string): Promise<{
    id: string;
    roomId: string;
    room: { visibility: string };
  } | null> {
    const thread = await this.prisma.thread.findUnique({
      where: { id: threadId },
      select: {
        id: true,
        roomId: true,
        room: {
          select: {
            visibility: true,
          },
        },
      },
    });

    return thread;
  }

  private async isRoomMember(userId: string, roomId: string): Promise<boolean> {
    const membership = await this.prisma.roomMember.findUnique({
      where: {
        roomId_userId: {
          roomId,
          userId,
        },
      },
    });

    return !!membership;
  }

  private async getRoomMemberRole(
    userId: string,
    roomId: string,
  ): Promise<'OWNER' | 'MODERATOR' | 'MEMBER' | null> {
    const membership = await this.prisma.roomMember.findUnique({
      where: {
        roomId_userId: {
          roomId,
          userId,
        },
      },
      select: {
        role: true,
      },
    });

    return membership?.role || null;
  }

  private canModerate(roomRole: string | null): boolean {
    return roomRole === 'OWNER' || roomRole === 'MODERATOR';
  }
}
