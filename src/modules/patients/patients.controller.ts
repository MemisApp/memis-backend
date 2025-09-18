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
import { PatientsService } from './patients.service';
import { CreatePatientDto } from './dto/create-patient.dto';
import { UpdatePatientDto } from './dto/update-patient.dto';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';

interface AuthenticatedRequest extends Request {
  user: {
    id: string;
    role: string;
  };
}

@ApiTags('patients')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard)
@Controller('/api/patients')
export class PatientsController {
  constructor(private readonly patientsService: PatientsService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Create patient profile (caregiver creates for patient)',
  })
  @ApiResponse({
    status: 201,
    description: 'Patient created successfully with pairing code',
    schema: {
      type: 'object',
      properties: {
        patient: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            firstName: { type: 'string' },
            lastName: { type: 'string' },
            birthDate: { type: 'string', format: 'date-time', nullable: true },
            avatarUrl: { type: 'string', nullable: true },
            shortIntro: { type: 'string', nullable: true },
            maritalDate: {
              type: 'string',
              format: 'date-time',
              nullable: true,
            },
            createdAt: { type: 'string', format: 'date-time' },
            updatedAt: { type: 'string', format: 'date-time' },
          },
        },
        pairingCode: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            code: { type: 'string' },
            expiresAt: { type: 'string', format: 'date-time' },
            createdAt: { type: 'string', format: 'date-time' },
          },
        },
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Invalid request body' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async create(
    @Request() req: AuthenticatedRequest,
    @Body() createPatientDto: CreatePatientDto,
  ) {
    const caregiverId = req.user.id;
    return this.patientsService.create(caregiverId, createPatientDto);
  }

  @Get()
  @ApiOperation({ summary: "Get caregiver's patients" })
  @ApiResponse({
    status: 200,
    description: 'Successfully retrieved patients',
    schema: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          firstName: { type: 'string' },
          lastName: { type: 'string' },
          birthDate: { type: 'string', format: 'date-time', nullable: true },
          avatarUrl: { type: 'string', nullable: true },
          shortIntro: { type: 'string', nullable: true },
          maritalDate: { type: 'string', format: 'date-time', nullable: true },
          caregiverRole: {
            type: 'string',
            enum: ['OWNER', 'EDITOR', 'VIEWER'],
          },
          assignedAt: { type: 'string', format: 'date-time' },
          createdAt: { type: 'string', format: 'date-time' },
          updatedAt: { type: 'string', format: 'date-time' },
        },
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async findAll(@Request() req: AuthenticatedRequest) {
    const caregiverId = req.user.id;
    return this.patientsService.findByCaregiver(caregiverId);
  }

  @Get('/:patientId')
  @ApiOperation({ summary: 'Get patient profile' })
  @ApiParam({ name: 'patientId', description: 'Patient ID' })
  @ApiResponse({
    status: 200,
    description: 'Patient retrieved successfully',
    schema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        firstName: { type: 'string' },
        lastName: { type: 'string' },
        birthDate: { type: 'string', format: 'date-time', nullable: true },
        avatarUrl: { type: 'string', nullable: true },
        shortIntro: { type: 'string', nullable: true },
        maritalDate: { type: 'string', format: 'date-time', nullable: true },
        createdAt: { type: 'string', format: 'date-time' },
        updatedAt: { type: 'string', format: 'date-time' },
        caregivers: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              role: { type: 'string' },
              caregiver: {
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
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'No access to this patient' })
  @ApiResponse({ status: 404, description: 'Patient not found' })
  async findOne(
    @Request() req: AuthenticatedRequest,
    @Param('patientId') patientId: string,
  ) {
    const userId = req.user.id;
    return this.patientsService.findOne(patientId, userId);
  }

  @Put('/:patientId')
  @ApiOperation({ summary: 'Update patient profile' })
  @ApiParam({ name: 'patientId', description: 'Patient ID' })
  @ApiResponse({
    status: 200,
    description: 'Patient updated successfully',
    schema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        firstName: { type: 'string' },
        lastName: { type: 'string' },
        birthDate: { type: 'string', format: 'date-time', nullable: true },
        avatarUrl: { type: 'string', nullable: true },
        shortIntro: { type: 'string', nullable: true },
        maritalDate: { type: 'string', format: 'date-time', nullable: true },
        createdAt: { type: 'string', format: 'date-time' },
        updatedAt: { type: 'string', format: 'date-time' },
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Invalid request body' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Insufficient permissions' })
  @ApiResponse({ status: 404, description: 'Patient not found' })
  async update(
    @Request() req: AuthenticatedRequest,
    @Param('patientId') patientId: string,
    @Body() updatePatientDto: UpdatePatientDto,
  ) {
    const userId = req.user.id;
    return this.patientsService.update(patientId, userId, updatePatientDto);
  }

  @Delete('/:patientId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete patient profile' })
  @ApiParam({ name: 'patientId', description: 'Patient ID' })
  @ApiResponse({
    status: 200,
    description: 'Patient deleted successfully',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Insufficient permissions' })
  @ApiResponse({ status: 404, description: 'Patient not found' })
  async remove(
    @Request() req: AuthenticatedRequest,
    @Param('patientId') patientId: string,
  ) {
    const userId = req.user.id;
    const userRole = req.user.role;
    return this.patientsService.remove(patientId, userId, userRole);
  }

  @Post('/:patientId/pairing-codes')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Generate new pairing code for patient' })
  @ApiParam({ name: 'patientId', description: 'Patient ID' })
  @ApiResponse({
    status: 201,
    description: 'Pairing code generated successfully',
    schema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        code: { type: 'string', example: 'ABCD1234' },
        expiresAt: { type: 'string', format: 'date-time' },
        createdAt: { type: 'string', format: 'date-time' },
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'No access to this patient' })
  async generatePairingCode(
    @Request() req: AuthenticatedRequest,
    @Param('patientId') patientId: string,
  ) {
    const caregiverId = req.user.id;
    return this.patientsService.generatePairingCode(patientId, caregiverId);
  }

  @Get('/:patientId/pairing-codes')
  @ApiOperation({ summary: 'Get active pairing codes for patient' })
  @ApiParam({ name: 'patientId', description: 'Patient ID' })
  @ApiResponse({
    status: 200,
    description: 'Successfully retrieved pairing codes',
    schema: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          code: { type: 'string' },
          expiresAt: { type: 'string', format: 'date-time' },
          createdAt: { type: 'string', format: 'date-time' },
        },
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'No access to this patient' })
  async getPairingCodes(
    @Request() req: AuthenticatedRequest,
    @Param('patientId') patientId: string,
  ) {
    const userId = req.user.id;
    return this.patientsService.getPairingCodes(patientId, userId);
  }
}
