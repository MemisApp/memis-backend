import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
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
  ApiParam,
} from '@nestjs/swagger';
import { RemindersService } from './reminders.service';
import { CreateReminderDto } from './dto/create-reminder.dto';
import { UpdateReminderDto } from './dto/update-reminder.dto';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';

interface AuthenticatedRequest extends Request {
  user: {
    id: string;
    role: string;
  };
}

@ApiTags('reminders')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard)
@Controller()
export class RemindersController {
  constructor(private readonly remindersService: RemindersService) {}

  @Get('/api/patients/:patientId/reminders')
  @ApiOperation({ summary: 'Get patient reminders' })
  @ApiParam({ name: 'patientId', description: 'Patient ID' })
  @ApiResponse({
    status: 200,
    description: 'Successfully retrieved reminders',
    schema: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          type: { type: 'string' },
          title: { type: 'string' },
          notes: { type: 'string', nullable: true },
          schedule: { type: 'string', nullable: true },
          isActive: { type: 'boolean' },
          lastFiredAt: { type: 'string', format: 'date-time', nullable: true },
          createdAt: { type: 'string', format: 'date-time' },
          updatedAt: { type: 'string', format: 'date-time' },
        },
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'No access to this patient' })
  async findByPatient(
    @Request() req: AuthenticatedRequest,
    @Param('patientId') patientId: string,
  ) {
    const userId = req.user.id;
    return this.remindersService.findByPatient(patientId, userId);
  }

  @Post('/api/patients/:patientId/reminders')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create reminder for patient' })
  @ApiParam({ name: 'patientId', description: 'Patient ID' })
  @ApiResponse({
    status: 201,
    description: 'Reminder created successfully',
    schema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        type: { type: 'string' },
        title: { type: 'string' },
        notes: { type: 'string', nullable: true },
        schedule: { type: 'string', nullable: true },
        isActive: { type: 'boolean' },
        lastFiredAt: { type: 'string', format: 'date-time', nullable: true },
        createdAt: { type: 'string', format: 'date-time' },
        updatedAt: { type: 'string', format: 'date-time' },
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Invalid request body' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Insufficient permissions' })
  async create(
    @Request() req: AuthenticatedRequest,
    @Param('patientId') patientId: string,
    @Body() createReminderDto: CreateReminderDto,
  ) {
    const userId = req.user.id;
    return this.remindersService.create(patientId, userId, createReminderDto);
  }

  @Get('/api/reminders/:reminderId')
  @ApiOperation({ summary: 'Get reminder by ID' })
  @ApiParam({ name: 'reminderId', description: 'Reminder ID' })
  @ApiResponse({
    status: 200,
    description: 'Reminder retrieved successfully',
    schema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        patientId: { type: 'string' },
        type: { type: 'string' },
        title: { type: 'string' },
        notes: { type: 'string', nullable: true },
        schedule: { type: 'string', nullable: true },
        isActive: { type: 'boolean' },
        lastFiredAt: { type: 'string', format: 'date-time', nullable: true },
        createdAt: { type: 'string', format: 'date-time' },
        updatedAt: { type: 'string', format: 'date-time' },
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'No access to this reminder' })
  @ApiResponse({ status: 404, description: 'Reminder not found' })
  async findOne(
    @Request() req: AuthenticatedRequest,
    @Param('reminderId') reminderId: string,
  ) {
    const userId = req.user.id;
    return this.remindersService.findOne(reminderId, userId);
  }

  @Put('/api/reminders/:reminderId')
  @ApiOperation({ summary: 'Update reminder' })
  @ApiParam({ name: 'reminderId', description: 'Reminder ID' })
  @ApiResponse({
    status: 200,
    description: 'Reminder updated successfully',
    schema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        type: { type: 'string' },
        title: { type: 'string' },
        notes: { type: 'string', nullable: true },
        schedule: { type: 'string', nullable: true },
        isActive: { type: 'boolean' },
        lastFiredAt: { type: 'string', format: 'date-time', nullable: true },
        createdAt: { type: 'string', format: 'date-time' },
        updatedAt: { type: 'string', format: 'date-time' },
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Invalid request body' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Insufficient permissions' })
  @ApiResponse({ status: 404, description: 'Reminder not found' })
  async update(
    @Request() req: AuthenticatedRequest,
    @Param('reminderId') reminderId: string,
    @Body() updateReminderDto: UpdateReminderDto,
  ) {
    const userId = req.user.id;
    return this.remindersService.update(reminderId, userId, updateReminderDto);
  }

  @Delete('/api/reminders/:reminderId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete reminder' })
  @ApiParam({ name: 'reminderId', description: 'Reminder ID' })
  @ApiResponse({
    status: 200,
    description: 'Reminder deleted successfully',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Insufficient permissions' })
  @ApiResponse({ status: 404, description: 'Reminder not found' })
  async remove(
    @Request() req: AuthenticatedRequest,
    @Param('reminderId') reminderId: string,
  ) {
    const userId = req.user.id;
    return this.remindersService.remove(reminderId, userId);
  }

  @Post('/api/reminders/:reminderId/complete')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Mark reminder as completed' })
  @ApiParam({ name: 'reminderId', description: 'Reminder ID' })
  @ApiResponse({
    status: 200,
    description: 'Reminder marked as completed',
    schema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        type: { type: 'string' },
        title: { type: 'string' },
        notes: { type: 'string', nullable: true },
        schedule: { type: 'string', nullable: true },
        isActive: { type: 'boolean' },
        lastFiredAt: { type: 'string', format: 'date-time', nullable: true },
        createdAt: { type: 'string', format: 'date-time' },
        updatedAt: { type: 'string', format: 'date-time' },
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'No access to this reminder' })
  @ApiResponse({ status: 404, description: 'Reminder not found' })
  async markCompleted(
    @Request() req: AuthenticatedRequest,
    @Param('reminderId') reminderId: string,
  ) {
    const userId = req.user.id;
    return this.remindersService.markCompleted(reminderId, userId);
  }
}
