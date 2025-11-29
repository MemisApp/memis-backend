import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
  HttpCode,
  HttpStatus,
  ParseIntPipe,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiQuery,
  ApiParam,
} from '@nestjs/swagger';
import { AdminService } from './admin.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { AdminGuard } from '../../auth/admin.guard';

@ApiTags('admin')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, AdminGuard)
@Controller('api/admin')
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  // ==================== USER MANAGEMENT ====================

  @Get('users')
  @ApiOperation({ summary: 'List all users (admin only)' })
  @ApiQuery({
    name: 'page',
    required: false,
    example: 1,
    description: 'Page number',
  })
  @ApiQuery({
    name: 'pageSize',
    required: false,
    example: 20,
    description: 'Items per page (max 100)',
  })
  @ApiResponse({
    status: 200,
    description: 'Successfully retrieved all users',
    schema: {
      type: 'object',
      properties: {
        items: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              firstName: { type: 'string' },
              lastName: { type: 'string' },
              email: { type: 'string' },
              phone: { type: 'string', nullable: true },
              role: { type: 'string', enum: ['CAREGIVER', 'PATIENT', 'ADMIN'] },
              createdAt: { type: 'string', format: 'date-time' },
              updatedAt: { type: 'string', format: 'date-time' },
            },
          },
        },
        page: { type: 'number' },
        pageSize: { type: 'number' },
        total: { type: 'number' },
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Admin access required' })
  async findAllUsers(
    @Query('page', new ParseIntPipe({ optional: true })) page?: number,
    @Query('pageSize', new ParseIntPipe({ optional: true })) pageSize?: number,
  ) {
    const pageNum = Math.max(1, page || 1);
    const pageSizeNum = pageSize || 20;
    return this.adminService.findAllUsers(pageNum, pageSizeNum);
  }

  @Get('users/:userId')
  @ApiOperation({ summary: 'Get user by ID (admin only)' })
  @ApiParam({ name: 'userId', description: 'User ID' })
  @ApiResponse({
    status: 200,
    description: 'User retrieved successfully',
    schema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        firstName: { type: 'string' },
        lastName: { type: 'string' },
        email: { type: 'string' },
        phone: { type: 'string', nullable: true },
        role: { type: 'string', enum: ['CAREGIVER', 'PATIENT', 'ADMIN'] },
        createdAt: { type: 'string', format: 'date-time' },
        updatedAt: { type: 'string', format: 'date-time' },
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Admin access required' })
  @ApiResponse({ status: 404, description: 'User not found' })
  async findUserById(@Param('userId') userId: string) {
    return this.adminService.findUserById(userId);
  }

  @Post('users')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create new user (admin only)' })
  @ApiResponse({
    status: 201,
    description: 'User created successfully',
    schema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        firstName: { type: 'string' },
        lastName: { type: 'string' },
        email: { type: 'string' },
        phone: { type: 'string', nullable: true },
        role: { type: 'string', enum: ['CAREGIVER', 'PATIENT', 'ADMIN'] },
        createdAt: { type: 'string', format: 'date-time' },
        updatedAt: { type: 'string', format: 'date-time' },
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Invalid request body' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Admin access required' })
  @ApiResponse({
    status: 409,
    description: 'User with this email already exists',
  })
  async createUser(@Body() createUserDto: CreateUserDto) {
    return this.adminService.createUser(createUserDto);
  }

  @Put('users/:userId')
  @ApiOperation({ summary: 'Update user (admin only)' })
  @ApiParam({ name: 'userId', description: 'User ID' })
  @ApiResponse({
    status: 200,
    description: 'User updated successfully',
    schema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        firstName: { type: 'string' },
        lastName: { type: 'string' },
        email: { type: 'string' },
        phone: { type: 'string', nullable: true },
        role: { type: 'string', enum: ['CAREGIVER', 'PATIENT', 'ADMIN'] },
        createdAt: { type: 'string', format: 'date-time' },
        updatedAt: { type: 'string', format: 'date-time' },
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Invalid request body' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Admin access required' })
  @ApiResponse({ status: 404, description: 'User not found' })
  @ApiResponse({
    status: 409,
    description: 'User with this email already exists',
  })
  async updateUser(
    @Param('userId') userId: string,
    @Body() updateUserDto: UpdateUserDto,
  ) {
    return this.adminService.updateUser(userId, updateUserDto);
  }

  @Delete('users/:userId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete user (admin only)' })
  @ApiParam({ name: 'userId', description: 'User ID' })
  @ApiResponse({
    status: 200,
    description: 'User deleted successfully',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Admin access required' })
  @ApiResponse({ status: 404, description: 'User not found' })
  async deleteUser(@Param('userId') userId: string) {
    return this.adminService.deleteUser(userId);
  }

  // ==================== LIST ALL ENTITIES ====================

  @Get('rooms')
  @ApiOperation({ summary: 'List all rooms (admin only)' })
  @ApiQuery({
    name: 'page',
    required: false,
    example: 1,
    description: 'Page number',
  })
  @ApiQuery({
    name: 'pageSize',
    required: false,
    example: 20,
    description: 'Items per page (max 100)',
  })
  @ApiResponse({
    status: 200,
    description: 'Successfully retrieved all rooms',
    schema: {
      type: 'object',
      properties: {
        items: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              name: { type: 'string' },
              visibility: { type: 'string', enum: ['PRIVATE', 'PUBLIC'] },
              createdById: { type: 'string' },
              createdAt: { type: 'string', format: 'date-time' },
              updatedAt: { type: 'string', format: 'date-time' },
              createdBy: {
                type: 'object',
                properties: {
                  id: { type: 'string' },
                  firstName: { type: 'string' },
                  lastName: { type: 'string' },
                  email: { type: 'string' },
                },
              },
              _count: {
                type: 'object',
                properties: {
                  members: { type: 'number' },
                  threads: { type: 'number' },
                },
              },
            },
          },
        },
        page: { type: 'number' },
        pageSize: { type: 'number' },
        total: { type: 'number' },
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Admin access required' })
  async findAllRooms(
    @Query('page', new ParseIntPipe({ optional: true })) page?: number,
    @Query('pageSize', new ParseIntPipe({ optional: true })) pageSize?: number,
  ) {
    const pageNum = Math.max(1, page || 1);
    const pageSizeNum = pageSize || 20;
    return this.adminService.findAllRooms(pageNum, pageSizeNum);
  }

  @Get('threads')
  @ApiOperation({ summary: 'List all threads (admin only)' })
  @ApiQuery({
    name: 'page',
    required: false,
    example: 1,
    description: 'Page number',
  })
  @ApiQuery({
    name: 'pageSize',
    required: false,
    example: 20,
    description: 'Items per page (max 100)',
  })
  @ApiResponse({
    status: 200,
    description: 'Successfully retrieved all threads',
    schema: {
      type: 'object',
      properties: {
        items: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              title: { type: 'string' },
              roomId: { type: 'string' },
              createdById: { type: 'string' },
              createdAt: { type: 'string', format: 'date-time' },
              updatedAt: { type: 'string', format: 'date-time' },
              room: {
                type: 'object',
                properties: {
                  id: { type: 'string' },
                  name: { type: 'string' },
                },
              },
              createdBy: {
                type: 'object',
                properties: {
                  id: { type: 'string' },
                  firstName: { type: 'string' },
                  lastName: { type: 'string' },
                  email: { type: 'string' },
                },
              },
              _count: {
                type: 'object',
                properties: {
                  messages: { type: 'number' },
                },
              },
            },
          },
        },
        page: { type: 'number' },
        pageSize: { type: 'number' },
        total: { type: 'number' },
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Admin access required' })
  async findAllThreads(
    @Query('page', new ParseIntPipe({ optional: true })) page?: number,
    @Query('pageSize', new ParseIntPipe({ optional: true })) pageSize?: number,
  ) {
    const pageNum = Math.max(1, page || 1);
    const pageSizeNum = pageSize || 20;
    return this.adminService.findAllThreads(pageNum, pageSizeNum);
  }

  @Get('messages')
  @ApiOperation({ summary: 'List all messages (admin only)' })
  @ApiQuery({
    name: 'page',
    required: false,
    example: 1,
    description: 'Page number',
  })
  @ApiQuery({
    name: 'pageSize',
    required: false,
    example: 50,
    description: 'Items per page (max 100)',
  })
  @ApiResponse({
    status: 200,
    description: 'Successfully retrieved all messages',
    schema: {
      type: 'object',
      properties: {
        items: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              content: { type: 'string' },
              threadId: { type: 'string' },
              authorId: { type: 'string' },
              editedAt: { type: 'string', format: 'date-time', nullable: true },
              createdAt: { type: 'string', format: 'date-time' },
              thread: {
                type: 'object',
                properties: {
                  id: { type: 'string' },
                  title: { type: 'string' },
                  roomId: { type: 'string' },
                  room: {
                    type: 'object',
                    properties: {
                      id: { type: 'string' },
                      name: { type: 'string' },
                    },
                  },
                },
              },
              author: {
                type: 'object',
                properties: {
                  id: { type: 'string' },
                  firstName: { type: 'string' },
                  lastName: { type: 'string' },
                  email: { type: 'string' },
                },
              },
            },
          },
        },
        page: { type: 'number' },
        pageSize: { type: 'number' },
        total: { type: 'number' },
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Admin access required' })
  async findAllMessages(
    @Query('page', new ParseIntPipe({ optional: true })) page?: number,
    @Query('pageSize', new ParseIntPipe({ optional: true })) pageSize?: number,
  ) {
    const pageNum = Math.max(1, page || 1);
    const pageSizeNum = pageSize || 50;
    return this.adminService.findAllMessages(pageNum, pageSizeNum);
  }

  @Get('patients')
  @ApiOperation({ summary: 'List all patients (admin only)' })
  @ApiQuery({
    name: 'page',
    required: false,
    example: 1,
    description: 'Page number',
  })
  @ApiQuery({
    name: 'pageSize',
    required: false,
    example: 20,
    description: 'Items per page (max 100)',
  })
  @ApiResponse({
    status: 200,
    description: 'Successfully retrieved all patients',
    schema: {
      type: 'object',
      properties: {
        items: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              firstName: { type: 'string' },
              lastName: { type: 'string' },
              birthDate: {
                type: 'string',
                format: 'date-time',
                nullable: true,
              },
              avatarUrl: { type: 'string', nullable: true },
              shortIntro: { type: 'string', nullable: true },
              maritalDate: {
                type: 'string',
                format: 'date-time',
                nullable: true,
              },
              createdAt: { type: 'string', format: 'date-time' },
              updatedAt: { type: 'string', format: 'date-time' },
              _count: {
                type: 'object',
                properties: {
                  caregivers: { type: 'number' },
                  reminders: { type: 'number' },
                  contacts: { type: 'number' },
                  devices: { type: 'number' },
                },
              },
            },
          },
        },
        page: { type: 'number' },
        pageSize: { type: 'number' },
        total: { type: 'number' },
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Admin access required' })
  async findAllPatients(
    @Query('page', new ParseIntPipe({ optional: true })) page?: number,
    @Query('pageSize', new ParseIntPipe({ optional: true })) pageSize?: number,
  ) {
    const pageNum = Math.max(1, page || 1);
    const pageSizeNum = pageSize || 20;
    return this.adminService.findAllPatients(pageNum, pageSizeNum);
  }

  // ==================== DASHBOARD STATISTICS ====================

  @Get('stats')
  @ApiOperation({ summary: 'Get dashboard statistics (admin only)' })
  @ApiResponse({
    status: 200,
    description: 'Successfully retrieved dashboard statistics',
    schema: {
      type: 'object',
      properties: {
        users: {
          type: 'object',
          properties: {
            total: { type: 'number' },
            caregivers: { type: 'number' },
            admins: { type: 'number' },
          },
        },
        patients: {
          type: 'object',
          properties: {
            total: { type: 'number' },
          },
        },
        rooms: {
          type: 'object',
          properties: {
            total: { type: 'number' },
          },
        },
        threads: {
          type: 'object',
          properties: {
            total: { type: 'number' },
          },
        },
        messages: {
          type: 'object',
          properties: {
            total: { type: 'number' },
          },
        },
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Admin access required' })
  async getDashboardStats() {
    return this.adminService.getDashboardStats();
  }
}
