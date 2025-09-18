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
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiQuery,
  ApiParam,
} from '@nestjs/swagger';
import { RoomsService } from './rooms.service';
import { CreateRoomDto } from './dto/create-room.dto';
import { UpdateRoomDto } from './dto/update-room.dto';
import { AddMemberDto } from './dto/add-member.dto';

import { JwtAuthGuard } from '../../auth/jwt-auth.guard';

interface AuthenticatedRequest extends Request {
  user: {
    id: string;
    role: string;
  };
}

@ApiTags('rooms')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard)
@Controller('api/rooms')
export class RoomsController {
  constructor(private readonly roomsService: RoomsService) {}

  @Get()
  @ApiOperation({ summary: 'Get user rooms (paginated)' })
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
    description: 'Items per page',
  })
  @ApiResponse({
    status: 200,
    description: 'Successfully retrieved user rooms',
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
            },
          },
        },
        page: { type: 'number' },
        pageSize: { type: 'number' },
        total: { type: 'number' },
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Invalid query parameters' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async findMyRooms(
    @Request() req: AuthenticatedRequest,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    const userId = req.user.id;
    const pageNum = page ? parseInt(page, 10) : 1;
    const pageSizeNum = pageSize ? parseInt(pageSize, 10) : 20;

    return this.roomsService.findMyRooms(userId, pageNum, pageSizeNum);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a new room' })
  @ApiResponse({
    status: 201,
    description: 'Room created successfully',
    schema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        name: { type: 'string' },
        visibility: { type: 'string', enum: ['PRIVATE', 'PUBLIC'] },
        createdById: { type: 'string' },
        createdAt: { type: 'string', format: 'date-time' },
        updatedAt: { type: 'string', format: 'date-time' },
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Invalid request body' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 409, description: 'Room name conflict' })
  async createRoom(
    @Request() req: AuthenticatedRequest,
    @Body() createRoomDto: CreateRoomDto,
  ) {
    const userId = req.user.id;
    return this.roomsService.createRoom(userId, createRoomDto);
  }

  @Get('/:roomId')
  @ApiOperation({ summary: 'Get room by ID' })
  @ApiParam({ name: 'roomId', description: 'Room ID' })
  @ApiResponse({
    status: 200,
    description: 'Room retrieved successfully',
    schema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        name: { type: 'string' },
        visibility: { type: 'string', enum: ['PRIVATE', 'PUBLIC'] },
        createdById: { type: 'string' },
        createdAt: { type: 'string', format: 'date-time' },
        updatedAt: { type: 'string', format: 'date-time' },
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Not a room member' })
  @ApiResponse({ status: 404, description: 'Room not found' })
  async getRoomById(
    @Request() req: AuthenticatedRequest,
    @Param('roomId') roomId: string,
  ) {
    const userId = req.user.id;
    return this.roomsService.getRoomById(userId, roomId);
  }

  @Put('/:roomId')
  @ApiOperation({ summary: 'Update room (owner/moderator only)' })
  @ApiParam({ name: 'roomId', description: 'Room ID' })
  @ApiResponse({
    status: 200,
    description: 'Room updated successfully',
    schema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        name: { type: 'string' },
        visibility: { type: 'string', enum: ['PRIVATE', 'PUBLIC'] },
        createdById: { type: 'string' },
        createdAt: { type: 'string', format: 'date-time' },
        updatedAt: { type: 'string', format: 'date-time' },
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Invalid request body' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Insufficient permissions' })
  @ApiResponse({ status: 404, description: 'Room not found' })
  @ApiResponse({ status: 409, description: 'Room name conflict' })
  async updateRoom(
    @Request() req: AuthenticatedRequest,
    @Param('roomId') roomId: string,
    @Body() updateRoomDto: UpdateRoomDto,
  ) {
    const userId = req.user.id;
    return this.roomsService.updateRoom(userId, roomId, updateRoomDto);
  }

  @Delete('/:roomId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete room (owner or admin only)' })
  @ApiParam({ name: 'roomId', description: 'Room ID' })
  @ApiResponse({
    status: 200,
    description: 'Room deleted successfully',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Insufficient permissions' })
  @ApiResponse({ status: 404, description: 'Room not found' })
  async deleteRoom(
    @Request() req: AuthenticatedRequest,
    @Param('roomId') roomId: string,
  ) {
    const userId = req.user.id;
    const userRole = req.user.role;
    return this.roomsService.deleteRoom(roomId, userId);
  }

  @Post('/:roomId/members')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Add user to room (for family sharing)' })
  @ApiParam({ name: 'roomId', description: 'Room ID' })
  @ApiResponse({
    status: 201,
    description: 'User added to room successfully',
    schema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        role: { type: 'string', enum: ['OWNER', 'MODERATOR', 'MEMBER'] },
        joinedAt: { type: 'string', format: 'date-time' },
        user: {
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
  })
  @ApiResponse({ status: 400, description: 'Invalid request body' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Insufficient permissions' })
  @ApiResponse({ status: 404, description: 'User not found' })
  @ApiResponse({ status: 409, description: 'User is already a member' })
  async addMember(
    @Request() req: AuthenticatedRequest,
    @Param('roomId') roomId: string,
    @Body() addMemberDto: AddMemberDto,
  ) {
    const userId = req.user.id;
    return this.roomsService.addMember(
      roomId,
      userId,
      addMemberDto.userId,
      addMemberDto.role,
    );
  }

  @Get('/:roomId/members')
  @ApiOperation({ summary: 'Get room members' })
  @ApiParam({ name: 'roomId', description: 'Room ID' })
  @ApiResponse({
    status: 200,
    description: 'Successfully retrieved room members',
    schema: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          role: { type: 'string', enum: ['OWNER', 'MODERATOR', 'MEMBER'] },
          joinedAt: { type: 'string', format: 'date-time' },
          user: {
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
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Not a room member' })
  async getMembers(
    @Request() req: AuthenticatedRequest,
    @Param('roomId') roomId: string,
  ) {
    const userId = req.user.id;
    return this.roomsService.getMembers(roomId, userId);
  }

  @Delete('/:roomId/members/:userId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Remove user from room' })
  @ApiParam({ name: 'roomId', description: 'Room ID' })
  @ApiParam({ name: 'userId', description: 'User ID to remove' })
  @ApiResponse({
    status: 200,
    description: 'User removed from room successfully',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Insufficient permissions' })
  @ApiResponse({ status: 404, description: 'User not found in room' })
  async removeMember(
    @Request() req: AuthenticatedRequest,
    @Param('roomId') roomId: string,
    @Param('userId') targetUserId: string,
  ) {
    const userId = req.user.id;
    return this.roomsService.removeMember(roomId, userId, targetUserId);
  }
}
