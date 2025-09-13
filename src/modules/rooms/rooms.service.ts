import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateRoomDto } from './dto/create-room.dto';
import { UpdateRoomDto } from './dto/update-room.dto';
import { RoomVisibility, RoomMemberRole, Role } from '@prisma/client';

@Injectable()
export class RoomsService {
  constructor(private prisma: PrismaService) {}

  async findMyRooms(userId: string, page: number = 1, pageSize: number = 20) {
    const skip = (page - 1) * pageSize;

    const [items, total] = await Promise.all([
      this.prisma.room.findMany({
        where: {
          members: {
            some: {
              userId,
            },
          },
        },
        select: {
          id: true,
          name: true,
          visibility: true,
          createdById: true,
          createdAt: true,
          updatedAt: true,
        },
        orderBy: {
          updatedAt: 'desc',
        },
        skip,
        take: pageSize,
      }),
      this.prisma.room.count({
        where: {
          members: {
            some: {
              userId,
            },
          },
        },
      }),
    ]);

    return {
      items,
      page,
      pageSize,
      total,
    };
  }

  async createRoom(userId: string, dto: CreateRoomDto) {
    // Check if user already has a room with this name
    const existingRoom = await this.prisma.room.findFirst({
      where: {
        name: dto.name,
        createdById: userId,
      },
    });

    if (existingRoom) {
      throw new ConflictException('ROOM_NAME_CONFLICT');
    }

    return this.prisma.room.create({
      data: {
        name: dto.name,
        visibility: dto.visibility as RoomVisibility,
        createdById: userId,
        members: {
          create: {
            userId,
            role: RoomMemberRole.OWNER,
          },
        },
      },
      select: {
        id: true,
        name: true,
        visibility: true,
        createdById: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  async getRoomById(userId: string, roomId: string) {
    const isMember = await this.isMember(userId, roomId);
    if (!isMember) {
      throw new ForbiddenException('NOT_ROOM_MEMBER');
    }

    const room = await this.prisma.room.findUnique({
      where: { id: roomId },
      select: {
        id: true,
        name: true,
        visibility: true,
        createdById: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!room) {
      throw new NotFoundException('ROOM_NOT_FOUND');
    }

    return room;
  }

  async updateRoom(userId: string, roomId: string, dto: UpdateRoomDto) {
    const room = await this.prisma.room.findUnique({
      where: { id: roomId },
    });

    if (!room) {
      throw new NotFoundException('ROOM_NOT_FOUND');
    }

    const hasPermission = await this.hasRole(userId, roomId, [
      RoomMemberRole.OWNER,
      RoomMemberRole.MODERATOR,
    ]);

    if (!hasPermission) {
      throw new ForbiddenException('FORBIDDEN');
    }

    // Check name conflict if name is being updated
    if (dto.name && dto.name !== room.name) {
      const existingRoom = await this.prisma.room.findFirst({
        where: {
          name: dto.name,
          createdById: userId,
          id: { not: roomId },
        },
      });

      if (existingRoom) {
        throw new ConflictException('ROOM_NAME_CONFLICT');
      }
    }

    return this.prisma.room.update({
      where: { id: roomId },
      data: {
        ...(dto.name && { name: dto.name }),
        ...(dto.visibility && { visibility: dto.visibility as RoomVisibility }),
      },
      select: {
        id: true,
        name: true,
        visibility: true,
        createdById: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  async deleteRoom(userId: string, roomId: string) {
    const room = await this.prisma.room.findUnique({
      where: { id: roomId },
    });

    if (!room) {
      throw new NotFoundException('ROOM_NOT_FOUND');
    }

    const isOwner = await this.hasRole(userId, roomId, [RoomMemberRole.OWNER]);
    const isAdmin = await this.isAdmin(userId);

    if (!isOwner && !isAdmin) {
      throw new ForbiddenException('FORBIDDEN');
    }

    await this.prisma.room.delete({
      where: { id: roomId },
    });

    return { success: true };
  }

  private async isMember(userId: string, roomId: string): Promise<boolean> {
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

  private async hasRole(
    userId: string,
    roomId: string,
    roles: RoomMemberRole[],
  ): Promise<boolean> {
    const membership = await this.prisma.roomMember.findUnique({
      where: {
        roomId_userId: {
          roomId,
          userId,
        },
      },
    });

    return membership ? roles.includes(membership.role) : false;
  }

  private async isAdmin(userId: string): Promise<boolean> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { role: true },
    });

    return user?.role === Role.ADMIN;
  }
}
