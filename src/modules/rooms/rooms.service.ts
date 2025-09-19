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
          OR: [
            // Rooms where user is a member
            {
              members: {
                some: {
                  userId,
                },
              },
            },
            // Public rooms (regardless of membership)
            {
              visibility: 'PUBLIC',
            },
          ],
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
          OR: [
            // Rooms where user is a member
            {
              members: {
                some: {
                  userId,
                },
              },
            },
            // Public rooms (regardless of membership)
            {
              visibility: 'PUBLIC',
            },
          ],
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

  async findPublicRooms(page: number = 1, pageSize: number = 20) {
    const skip = (page - 1) * pageSize;

    const [items, total] = await Promise.all([
      this.prisma.room.findMany({
        where: {
          visibility: 'PUBLIC',
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
          visibility: 'PUBLIC',
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

    // Allow access to public rooms for everyone
    if (room.visibility === 'PUBLIC') {
      return room;
    }

    // For private rooms, check if user is a member
    const isMember = await this.isMember(userId, roomId);
    if (!isMember) {
      throw new ForbiddenException('NOT_ROOM_MEMBER');
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

  private async getRoomMemberRole(
    userId: string,
    roomId: string,
  ): Promise<string | null> {
    const membership = await this.prisma.roomMember.findUnique({
      where: {
        roomId_userId: {
          roomId,
          userId,
        },
      },
      select: { role: true },
    });

    return membership?.role || null;
  }

  private canModerate(role: string): boolean {
    return role === 'OWNER' || role === 'MODERATOR';
  }

  async addMember(
    roomId: string,
    userId: string,
    targetUserId: string,
    role: string,
  ) {
    // Check if user is OWNER or MODERATOR of the room
    const userRole = await this.getRoomMemberRole(userId, roomId);
    if (!userRole || !this.canModerate(userRole)) {
      throw new ForbiddenException(
        'Only room owners and moderators can add members',
      );
    }

    // Check if target user exists
    const targetUser = await this.prisma.user.findUnique({
      where: { id: targetUserId },
      select: { id: true, firstName: true, lastName: true, email: true },
    });

    if (!targetUser) {
      throw new NotFoundException('User not found');
    }

    // Check if user is already a member
    const existingMember = await this.prisma.roomMember.findUnique({
      where: {
        roomId_userId: {
          roomId,
          userId: targetUserId,
        },
      },
    });

    if (existingMember) {
      throw new ConflictException('User is already a member of this room');
    }

    const member = await this.prisma.roomMember.create({
      data: {
        roomId,
        userId: targetUserId,
        role: role as RoomMemberRole,
      },
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
      },
    });

    return {
      id: member.id,
      role: member.role,
      joinedAt: member.joinedAt,
      user: member.user,
    };
  }

  async getMembers(roomId: string, userId: string) {
    // Check if user is member of the room
    const isMember = await this.isMember(userId, roomId);
    if (!isMember) {
      throw new ForbiddenException('NOT_ROOM_MEMBER');
    }

    const members = await this.prisma.roomMember.findMany({
      where: { roomId },
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
      },
      orderBy: [
        { role: 'asc' }, // OWNER, MODERATOR, MEMBER
        { joinedAt: 'asc' },
      ],
    });

    return members.map((member) => ({
      id: member.id,
      role: member.role,
      joinedAt: member.joinedAt,
      user: member.user,
    }));
  }

  async removeMember(roomId: string, userId: string, targetUserId: string) {
    // Check if user is OWNER or MODERATOR of the room
    const userRole = await this.getRoomMemberRole(userId, roomId);
    if (!userRole || !this.canModerate(userRole)) {
      throw new ForbiddenException(
        'Only room owners and moderators can remove members',
      );
    }

    // Cannot remove room owner (unless removing themselves)
    const targetMemberRole = await this.getRoomMemberRole(targetUserId, roomId);
    if (targetMemberRole === 'OWNER' && userId !== targetUserId) {
      throw new ForbiddenException('Cannot remove room owner');
    }

    // Check if member exists
    const member = await this.prisma.roomMember.findUnique({
      where: {
        roomId_userId: {
          roomId,
          userId: targetUserId,
        },
      },
    });

    if (!member) {
      throw new NotFoundException('User is not a member of this room');
    }

    await this.prisma.roomMember.delete({
      where: {
        roomId_userId: {
          roomId,
          userId: targetUserId,
        },
      },
    });

    return { success: true };
  }
}
