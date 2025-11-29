import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import * as bcrypt from 'bcrypt';
import { Role } from '@prisma/client';

@Injectable()
export class AdminService {
  constructor(private prisma: PrismaService) {}

  private async hash(data: string) {
    return bcrypt.hash(data, 12);
  }

  // ==================== USER MANAGEMENT ====================

  async findAllUsers(page: number = 1, pageSize: number = 20) {
    const skip = (page - 1) * pageSize;
    const pageSizeNum = Math.min(Math.max(1, pageSize), 100); // Clamp between 1-100

    const [items, total] = await Promise.all([
      this.prisma.user.findMany({
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          phone: true,
          role: true,
          createdAt: true,
          updatedAt: true,
        },
        orderBy: {
          createdAt: 'desc',
        },
        skip,
        take: pageSizeNum,
      }),
      this.prisma.user.count(),
    ]);

    return {
      items,
      page,
      pageSize: pageSizeNum,
      total,
    };
  }

  async findUserById(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        phone: true,
        role: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return user;
  }

  async createUser(createUserDto: CreateUserDto) {
    const email = createUserDto.email.trim().toLowerCase();
    const exists = await this.prisma.user.findUnique({ where: { email } });
    if (exists) {
      throw new ConflictException('User with this email already exists');
    }

    const passwordHash = await this.hash(createUserDto.password);

    const user = await this.prisma.user.create({
      data: {
        email,
        passwordHash,
        firstName: createUserDto.firstName,
        lastName: createUserDto.lastName,
        phone: createUserDto.phone,
        role: createUserDto.role || Role.CAREGIVER,
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        phone: true,
        role: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return user;
  }

  async updateUser(userId: string, updateUserDto: UpdateUserDto) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const updateData: {
      firstName?: string;
      lastName?: string;
      email?: string;
      phone?: string | null;
      role?: Role;
      passwordHash?: string;
    } = {};

    if (updateUserDto.firstName !== undefined) {
      updateData.firstName = updateUserDto.firstName;
    }
    if (updateUserDto.lastName !== undefined) {
      updateData.lastName = updateUserDto.lastName;
    }
    if (updateUserDto.email !== undefined) {
      const email = updateUserDto.email.trim().toLowerCase();
      if (email !== user.email) {
        const exists = await this.prisma.user.findUnique({ where: { email } });
        if (exists) {
          throw new ConflictException('User with this email already exists');
        }
        updateData.email = email;
      }
    }
    if (updateUserDto.phone !== undefined) {
      updateData.phone = updateUserDto.phone;
    }
    if (updateUserDto.role !== undefined) {
      updateData.role = updateUserDto.role;
    }
    if (updateUserDto.password !== undefined) {
      if (updateUserDto.password.length < 8) {
        throw new BadRequestException('Password must be at least 8 characters');
      }
      updateData.passwordHash = await this.hash(updateUserDto.password);
    }

    const updatedUser = await this.prisma.user.update({
      where: { id: userId },
      data: updateData,
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        phone: true,
        role: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return updatedUser;
  }

  async deleteUser(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    await this.prisma.user.delete({
      where: { id: userId },
    });

    return { success: true };
  }

  // ==================== LIST ALL ENTITIES ====================

  async findAllRooms(page: number = 1, pageSize: number = 20) {
    const skip = (page - 1) * pageSize;
    const pageSizeNum = Math.min(Math.max(1, pageSize), 100);

    const [items, total] = await Promise.all([
      this.prisma.room.findMany({
        select: {
          id: true,
          name: true,
          visibility: true,
          createdById: true,
          createdAt: true,
          updatedAt: true,
          createdBy: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
            },
          },
          _count: {
            select: {
              members: true,
              threads: true,
            },
          },
        },
        orderBy: {
          updatedAt: 'desc',
        },
        skip,
        take: pageSizeNum,
      }),
      this.prisma.room.count(),
    ]);

    return {
      items,
      page,
      pageSize: pageSizeNum,
      total,
    };
  }

  async findAllThreads(page: number = 1, pageSize: number = 20) {
    const skip = (page - 1) * pageSize;
    const pageSizeNum = Math.min(Math.max(1, pageSize), 100);

    const [items, total] = await Promise.all([
      this.prisma.thread.findMany({
        select: {
          id: true,
          title: true,
          roomId: true,
          createdById: true,
          createdAt: true,
          updatedAt: true,
          room: {
            select: {
              id: true,
              name: true,
            },
          },
          createdBy: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
            },
          },
          _count: {
            select: {
              messages: true,
            },
          },
        },
        orderBy: {
          updatedAt: 'desc',
        },
        skip,
        take: pageSizeNum,
      }),
      this.prisma.thread.count(),
    ]);

    return {
      items,
      page,
      pageSize: pageSizeNum,
      total,
    };
  }

  async findAllMessages(page: number = 1, pageSize: number = 50) {
    const skip = (page - 1) * pageSize;
    const pageSizeNum = Math.min(Math.max(1, pageSize), 100);

    const [items, total] = await Promise.all([
      this.prisma.message.findMany({
        select: {
          id: true,
          content: true,
          threadId: true,
          authorId: true,
          editedAt: true,
          createdAt: true,
          thread: {
            select: {
              id: true,
              title: true,
              roomId: true,
              room: {
                select: {
                  id: true,
                  name: true,
                },
              },
            },
          },
          author: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
            },
          },
        },
        orderBy: {
          createdAt: 'desc',
        },
        skip,
        take: pageSizeNum,
      }),
      this.prisma.message.count(),
    ]);

    return {
      items,
      page,
      pageSize: pageSizeNum,
      total,
    };
  }

  async findAllPatients(page: number = 1, pageSize: number = 20) {
    const skip = (page - 1) * pageSize;
    const pageSizeNum = Math.min(Math.max(1, pageSize), 100);

    const [items, total] = await Promise.all([
      this.prisma.patient.findMany({
        select: {
          id: true,
          firstName: true,
          lastName: true,
          birthDate: true,
          avatarUrl: true,
          shortIntro: true,
          maritalDate: true,
          createdAt: true,
          updatedAt: true,
          _count: {
            select: {
              caregivers: true,
              reminders: true,
              contacts: true,
              devices: true,
            },
          },
        },
        orderBy: {
          createdAt: 'desc',
        },
        skip,
        take: pageSizeNum,
      }),
      this.prisma.patient.count(),
    ]);

    return {
      items,
      page,
      pageSize: pageSizeNum,
      total,
    };
  }

  // ==================== DASHBOARD STATISTICS ====================

  async getDashboardStats() {
    const [
      totalUsers,
      totalPatients,
      totalRooms,
      totalThreads,
      totalMessages,
      totalCaregivers,
      totalAdmins,
    ] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.patient.count(),
      this.prisma.room.count(),
      this.prisma.thread.count(),
      this.prisma.message.count(),
      this.prisma.user.count({ where: { role: Role.CAREGIVER } }),
      this.prisma.user.count({ where: { role: Role.ADMIN } }),
    ]);

    return {
      users: {
        total: totalUsers,
        caregivers: totalCaregivers,
        admins: totalAdmins,
      },
      patients: {
        total: totalPatients,
      },
      rooms: {
        total: totalRooms,
      },
      threads: {
        total: totalThreads,
      },
      messages: {
        total: totalMessages,
      },
    };
  }
}
