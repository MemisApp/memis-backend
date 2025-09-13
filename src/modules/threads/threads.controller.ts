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
import { ThreadsService } from './threads.service';
import { CreateThreadDto } from './dto/create-thread.dto';
import { UpdateThreadDto } from './dto/update-thread.dto';

// TODO: Import and use JwtAuthGuard when available
// import { JwtAuthGuard } from '../auth/jwt-auth.guard';

interface AuthenticatedRequest extends Request {
  user: {
    id: string;
    role: string;
  };
}

@ApiTags('threads')
@ApiBearerAuth('access-token')
// @UseGuards(JwtAuthGuard) // TODO: Enable when JwtAuthGuard is available
@Controller()
export class ThreadsController {
  constructor(private readonly threadsService: ThreadsService) {}

  @Get('api/rooms/:roomId/threads')
  @ApiOperation({ summary: 'List threads in a room (hierarchical)' })
  @ApiParam({ name: 'roomId', description: 'Room ID' })
  @ApiQuery({ name: 'page', required: false, example: 1, description: 'Page number' })
  @ApiQuery({ name: 'pageSize', required: false, example: 20, description: 'Items per page' })
  @ApiResponse({
    status: 200,
    description: 'Successfully retrieved room threads',
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
  @ApiResponse({ status: 403, description: 'Not a room member' })
  async listByRoom(
    @Request() req: AuthenticatedRequest,
    @Param('roomId') roomId: string,
    @Query('page', new ParseIntPipe({ optional: true })) page?: number,
    @Query('pageSize', new ParseIntPipe({ optional: true })) pageSize?: number,
  ) {
    const userId = req.user?.id || 'clm1tempuserid00000000000000'; // TODO: Remove when JwtAuthGuard is available
    const pageNum = Math.max(1, page || 1);
    const pageSizeNum = Math.min(Math.max(1, pageSize || 20), 100); // Clamp between 1-100

    return this.threadsService.listByRoom(userId, roomId, pageNum, pageSizeNum);
  }

  @Post('api/rooms/:roomId/threads')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create thread in a room (hierarchical)' })
  @ApiParam({ name: 'roomId', description: 'Room ID' })
  @ApiResponse({
    status: 201,
    description: 'Thread created successfully',
    schema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        title: { type: 'string' },
        roomId: { type: 'string' },
        createdById: { type: 'string' },
        createdAt: { type: 'string', format: 'date-time' },
        updatedAt: { type: 'string', format: 'date-time' },
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Invalid request body' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Not a room member' })
  @ApiResponse({ status: 404, description: 'Room not found' })
  async createInRoom(
    @Request() req: AuthenticatedRequest,
    @Param('roomId') roomId: string,
    @Body() createThreadDto: CreateThreadDto,
  ) {
    const userId = req.user?.id || 'clm1tempuserid00000000000000'; // TODO: Remove when JwtAuthGuard is available
    return this.threadsService.createInRoom(userId, roomId, createThreadDto);
  }

  @Get('api/threads/:threadId')
  @ApiOperation({ summary: 'Get thread by id' })
  @ApiParam({ name: 'threadId', description: 'Thread ID' })
  @ApiResponse({
    status: 200,
    description: 'Thread retrieved successfully',
    schema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        title: { type: 'string' },
        roomId: { type: 'string' },
        createdById: { type: 'string' },
        createdAt: { type: 'string', format: 'date-time' },
        updatedAt: { type: 'string', format: 'date-time' },
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Not a room member' })
  @ApiResponse({ status: 404, description: 'Thread not found' })
  async getById(
    @Request() req: AuthenticatedRequest,
    @Param('threadId') threadId: string,
  ) {
    const userId = req.user?.id || 'clm1tempuserid00000000000000'; // TODO: Remove when JwtAuthGuard is available
    return this.threadsService.getById(userId, threadId);
  }

  @Put('api/threads/:threadId')
  @ApiOperation({ summary: 'Update thread' })
  @ApiParam({ name: 'threadId', description: 'Thread ID' })
  @ApiResponse({
    status: 200,
    description: 'Thread updated successfully',
    schema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        title: { type: 'string' },
        roomId: { type: 'string' },
        createdById: { type: 'string' },
        createdAt: { type: 'string', format: 'date-time' },
        updatedAt: { type: 'string', format: 'date-time' },
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Invalid request body' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Insufficient privileges' })
  @ApiResponse({ status: 404, description: 'Thread not found' })
  async updateById(
    @Request() req: AuthenticatedRequest,
    @Param('threadId') threadId: string,
    @Body() updateThreadDto: UpdateThreadDto,
  ) {
    const userId = req.user?.id || 'clm1tempuserid00000000000000'; // TODO: Remove when JwtAuthGuard is available
    return this.threadsService.updateById(userId, threadId, updateThreadDto);
  }

  @Delete('api/threads/:threadId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete thread' })
  @ApiParam({ name: 'threadId', description: 'Thread ID' })
  @ApiResponse({
    status: 200,
    description: 'Thread deleted successfully',
    schema: {
      type: 'object',
      properties: {
        ok: { type: 'boolean' },
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Insufficient privileges' })
  @ApiResponse({ status: 404, description: 'Thread not found' })
  async deleteById(
    @Request() req: AuthenticatedRequest,
    @Param('threadId') threadId: string,
  ) {
    const userId = req.user?.id || 'clm1tempuserid00000000000000'; // TODO: Remove when JwtAuthGuard is available
    const userRole = req.user?.role || 'CAREGIVER'; // TODO: Remove when JwtAuthGuard is available
    return this.threadsService.deleteById(userId, userRole, threadId);
  }
}
