import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
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
import { MessagesService } from './messages.service';
import { CreateMessageDto } from './dto/create-message.dto';
import { UpdateMessageDto } from './dto/update-message.dto';

// TODO: Import and use JwtAuthGuard when available
// import { JwtAuthGuard } from '../auth/jwt-auth.guard';

interface AuthenticatedRequest extends Request {
  user: {
    id: string;
    role: string;
  };
}

@ApiTags('messages')
@ApiBearerAuth('access-token')
// @UseGuards(JwtAuthGuard) // TODO: Enable when JwtAuthGuard is available
@Controller()
export class MessagesController {
  constructor(private readonly messagesService: MessagesService) {}

  @Get('api/threads/:threadId/messages')
  @ApiOperation({ summary: 'List messages in a thread (hierarchical)' })
  @ApiParam({ name: 'threadId', description: 'Thread ID' })
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
    description: 'Items per page',
  })
  @ApiResponse({
    status: 200,
    description: 'Successfully retrieved thread messages',
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
  @ApiResponse({ status: 404, description: 'Thread not found' })
  async listByThread(
    @Request() req: AuthenticatedRequest,
    @Param('threadId') threadId: string,
    @Query('page', new ParseIntPipe({ optional: true })) page?: number,
    @Query('pageSize', new ParseIntPipe({ optional: true })) pageSize?: number,
  ) {
    const userId = req.user?.id || 'clm1tempuserid00000000000000'; // TODO: Remove when JwtAuthGuard is available
    const pageNum = Math.max(1, page || 1);
    const pageSizeNum = Math.min(Math.max(1, pageSize || 50), 100); // Clamp between 1-100

    return this.messagesService.listByThread(
      userId,
      threadId,
      pageNum,
      pageSizeNum,
    );
  }

  @Post('api/threads/:threadId/messages')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create message in a thread (hierarchical)' })
  @ApiParam({ name: 'threadId', description: 'Thread ID' })
  @ApiResponse({
    status: 201,
    description: 'Message created successfully',
    schema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        content: { type: 'string' },
        threadId: { type: 'string' },
        authorId: { type: 'string' },
        editedAt: { type: 'string', format: 'date-time', nullable: true },
        createdAt: { type: 'string', format: 'date-time' },
      },
    },
  })
  @ApiResponse({
    status: 400,
    description: 'Empty content or invalid request body',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Not a room member' })
  @ApiResponse({ status: 404, description: 'Thread not found' })
  async createInThread(
    @Request() req: AuthenticatedRequest,
    @Param('threadId') threadId: string,
    @Body() createMessageDto: CreateMessageDto,
  ) {
    const userId = req.user?.id || 'clm1tempuserid00000000000000'; // TODO: Remove when JwtAuthGuard is available
    return this.messagesService.createInThread(
      userId,
      threadId,
      createMessageDto,
    );
  }

  @Get('api/messages/:messageId')
  @ApiOperation({ summary: 'Get message by id' })
  @ApiParam({ name: 'messageId', description: 'Message ID' })
  @ApiResponse({
    status: 200,
    description: 'Message retrieved successfully',
    schema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        content: { type: 'string' },
        threadId: { type: 'string' },
        authorId: { type: 'string' },
        editedAt: { type: 'string', format: 'date-time', nullable: true },
        createdAt: { type: 'string', format: 'date-time' },
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Not a room member' })
  @ApiResponse({ status: 404, description: 'Message not found' })
  async getById(
    @Request() req: AuthenticatedRequest,
    @Param('messageId') messageId: string,
  ) {
    const userId = req.user?.id || 'clm1tempuserid00000000000000'; // TODO: Remove when JwtAuthGuard is available
    return this.messagesService.getById(userId, messageId);
  }

  @Put('api/messages/:messageId')
  @ApiOperation({ summary: 'Update message' })
  @ApiParam({ name: 'messageId', description: 'Message ID' })
  @ApiResponse({
    status: 200,
    description: 'Message updated successfully',
    schema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        content: { type: 'string' },
        threadId: { type: 'string' },
        authorId: { type: 'string' },
        editedAt: { type: 'string', format: 'date-time', nullable: true },
        createdAt: { type: 'string', format: 'date-time' },
      },
    },
  })
  @ApiResponse({
    status: 400,
    description: 'Empty content or invalid request body',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Insufficient privileges' })
  @ApiResponse({ status: 404, description: 'Message not found' })
  async updateById(
    @Request() req: AuthenticatedRequest,
    @Param('messageId') messageId: string,
    @Body() updateMessageDto: UpdateMessageDto,
  ) {
    const userId = req.user?.id || 'clm1tempuserid00000000000000'; // TODO: Remove when JwtAuthGuard is available
    const userRole = req.user?.role || 'CAREGIVER'; // TODO: Remove when JwtAuthGuard is available
    return this.messagesService.updateById(
      userId,
      userRole,
      messageId,
      updateMessageDto,
    );
  }

  @Delete('api/messages/:messageId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete message' })
  @ApiParam({ name: 'messageId', description: 'Message ID' })
  @ApiResponse({
    status: 200,
    description: 'Message deleted successfully',
    schema: {
      type: 'object',
      properties: {
        ok: { type: 'boolean' },
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Insufficient privileges' })
  @ApiResponse({ status: 404, description: 'Message not found' })
  async deleteById(
    @Request() req: AuthenticatedRequest,
    @Param('messageId') messageId: string,
  ) {
    const userId = req.user?.id || 'clm1tempuserid00000000000000'; // TODO: Remove when JwtAuthGuard is available
    const userRole = req.user?.role || 'CAREGIVER'; // TODO: Remove when JwtAuthGuard is available
    return this.messagesService.deleteById(userId, userRole, messageId);
  }
}
