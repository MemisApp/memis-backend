import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateThreadDto } from './dto/create-thread.dto';
import { UpdateThreadDto } from './dto/update-thread.dto';
import { Role } from '@prisma/client';

@Injectable()
export class ThreadsService {
  constructor(private prisma: PrismaService) {}

  async listByRoom(
    userId: string,
    roomId: string,
    page: number = 1,
    pageSize: number = 20,
  ) {
    // Check if room exists and get its visibility
    const room = await this.prisma.room.findUnique({
      where: { id: roomId },
      select: { id: true, visibility: true },
    });

    if (!room) {
      throw new NotFoundException('ROOM_NOT_FOUND');
    }

    // Allow access to public rooms for everyone
    if (room.visibility === 'PUBLIC') {
      // Continue to fetch threads
    } else {
      // For private rooms, check membership
      const isMember = await this.isRoomMember(userId, roomId);
      if (!isMember) {
        throw new ForbiddenException('NOT_ROOM_MEMBER');
      }
    }

    const skip = (page - 1) * pageSize;

    const [items, total] = await Promise.all([
      this.prisma.thread.findMany({
        where: { roomId },
        select: {
          id: true,
          title: true,
          roomId: true,
          createdById: true,
          createdAt: true,
          updatedAt: true,
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: pageSize,
      }),
      this.prisma.thread.count({
        where: { roomId },
      }),
    ]);

    return {
      items,
      page,
      pageSize,
      total,
    };
  }

  async createInRoom(userId: string, roomId: string, dto: CreateThreadDto) {
    // Verify room exists and get its visibility
    const room = await this.prisma.room.findUnique({
      where: { id: roomId },
      select: { id: true, visibility: true },
    });
    if (!room) {
      throw new NotFoundException('ROOM_NOT_FOUND');
    }

    // Allow thread creation in public rooms for everyone
    if (room.visibility === 'PUBLIC') {
      // Continue to create thread
    } else {
      // For private rooms, check membership
      const isMember = await this.isRoomMember(userId, roomId);
      if (!isMember) {
        throw new ForbiddenException('NOT_ROOM_MEMBER');
      }
    }

    return this.prisma.thread.create({
      data: {
        roomId,
        title: dto.title,
        createdById: userId,
      },
      select: {
        id: true,
        title: true,
        roomId: true,
        createdById: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  async getById(userId: string, threadId: string) {
    // Load thread with roomId and room visibility
    const thread = await this.prisma.thread.findUnique({
      where: { id: threadId },
      select: {
        id: true,
        title: true,
        roomId: true,
        createdById: true,
        createdAt: true,
        updatedAt: true,
        room: {
          select: {
            visibility: true,
          },
        },
      },
    });

    if (!thread) {
      throw new NotFoundException('THREAD_NOT_FOUND');
    }

    // Allow access to threads in public rooms for everyone
    if (thread.room.visibility === 'PUBLIC') {
      return {
        id: thread.id,
        title: thread.title,
        roomId: thread.roomId,
        createdById: thread.createdById,
        createdAt: thread.createdAt,
        updatedAt: thread.updatedAt,
      };
    }

    // For private rooms, check membership
    const isMember = await this.isRoomMember(userId, thread.roomId);
    if (!isMember) {
      throw new ForbiddenException('NOT_ROOM_MEMBER');
    }

    return {
      id: thread.id,
      title: thread.title,
      roomId: thread.roomId,
      createdById: thread.createdById,
      createdAt: thread.createdAt,
      updatedAt: thread.updatedAt,
    };
  }

  async updateById(userId: string, threadId: string, dto: UpdateThreadDto) {
    // Load thread with roomId and createdById
    const thread = await this.prisma.thread.findUnique({
      where: { id: threadId },
      select: {
        id: true,
        title: true,
        roomId: true,
        createdById: true,
      },
    });

    if (!thread) {
      throw new NotFoundException('THREAD_NOT_FOUND');
    }

    // Authorize: author OR room OWNER/MODERATOR OR ADMIN
    const isAuthor = thread.createdById === userId;
    const roomRole = await this.getRoomMemberRole(userId, thread.roomId);
    const canModerate = this.canModerate(roomRole);
    const isAdmin = await this.isAdmin(userId);

    if (!isAuthor && !canModerate && !isAdmin) {
      throw new ForbiddenException('INSUFFICIENT_PRIVILEGES');
    }

    return this.prisma.thread.update({
      where: { id: threadId },
      data: {
        ...(dto.title && { title: dto.title }),
      },
      select: {
        id: true,
        title: true,
        roomId: true,
        createdById: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  async deleteById(userId: string, userRole: string, threadId: string) {
    // Load thread with roomId and createdById
    const thread = await this.prisma.thread.findUnique({
      where: { id: threadId },
      select: {
        id: true,
        roomId: true,
        createdById: true,
      },
    });

    if (!thread) {
      throw new NotFoundException('THREAD_NOT_FOUND');
    }

    // Authorize: author OR room OWNER/MODERATOR OR ADMIN
    const isAuthor = thread.createdById === userId;
    const roomRole = await this.getRoomMemberRole(userId, thread.roomId);
    const canModerate = this.canModerate(roomRole);
    const isAdmin = userRole === Role.ADMIN;

    if (!isAuthor && !canModerate && !isAdmin) {
      throw new ForbiddenException('INSUFFICIENT_PRIVILEGES');
    }

    await this.prisma.thread.delete({
      where: { id: threadId },
    });

    return { ok: true };
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

  private async isAdmin(userId: string): Promise<boolean> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { role: true },
    });

    return user?.role === Role.ADMIN;
  }
}
