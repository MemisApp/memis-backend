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
import { ContactsService } from './contacts.service';
import { CreateContactDto } from './dto/create-contact.dto';
import { UpdateContactDto } from './dto/update-contact.dto';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';

interface AuthenticatedRequest extends Request {
  user: {
    id: string;
    role: string;
  };
}

@ApiTags('contacts')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard)
@Controller()
export class ContactsController {
  constructor(private readonly contactsService: ContactsService) {}

  @Get('/api/patients/:patientId/contacts')
  @ApiOperation({ summary: 'Get patient contacts' })
  @ApiParam({ name: 'patientId', description: 'Patient ID' })
  @ApiResponse({
    status: 200,
    description: 'Successfully retrieved contacts',
    schema: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          relation: { type: 'string' },
          name: { type: 'string' },
          phone: { type: 'string' },
          photoUrl: { type: 'string', nullable: true },
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
    return this.contactsService.findByPatient(patientId, userId);
  }

  @Post('/api/patients/:patientId/contacts')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create contact for patient' })
  @ApiParam({ name: 'patientId', description: 'Patient ID' })
  @ApiResponse({
    status: 201,
    description: 'Contact created successfully',
    schema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        relation: { type: 'string' },
        name: { type: 'string' },
        phone: { type: 'string' },
        photoUrl: { type: 'string', nullable: true },
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
    @Body() createContactDto: CreateContactDto,
  ) {
    const userId = req.user.id;
    return this.contactsService.create(patientId, userId, createContactDto);
  }

  @Get('/api/contacts/:contactId')
  @ApiOperation({ summary: 'Get contact by ID' })
  @ApiParam({ name: 'contactId', description: 'Contact ID' })
  @ApiResponse({
    status: 200,
    description: 'Contact retrieved successfully',
    schema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        patientId: { type: 'string' },
        relation: { type: 'string' },
        name: { type: 'string' },
        phone: { type: 'string' },
        photoUrl: { type: 'string', nullable: true },
        createdAt: { type: 'string', format: 'date-time' },
        updatedAt: { type: 'string', format: 'date-time' },
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'No access to this contact' })
  @ApiResponse({ status: 404, description: 'Contact not found' })
  async findOne(
    @Request() req: AuthenticatedRequest,
    @Param('contactId') contactId: string,
  ) {
    const userId = req.user.id;
    return this.contactsService.findOne(contactId, userId);
  }

  @Put('/api/contacts/:contactId')
  @ApiOperation({ summary: 'Update contact' })
  @ApiParam({ name: 'contactId', description: 'Contact ID' })
  @ApiResponse({
    status: 200,
    description: 'Contact updated successfully',
    schema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        relation: { type: 'string' },
        name: { type: 'string' },
        phone: { type: 'string' },
        photoUrl: { type: 'string', nullable: true },
        createdAt: { type: 'string', format: 'date-time' },
        updatedAt: { type: 'string', format: 'date-time' },
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Invalid request body' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Insufficient permissions' })
  @ApiResponse({ status: 404, description: 'Contact not found' })
  async update(
    @Request() req: AuthenticatedRequest,
    @Param('contactId') contactId: string,
    @Body() updateContactDto: UpdateContactDto,
  ) {
    const userId = req.user.id;
    return this.contactsService.update(contactId, userId, updateContactDto);
  }

  @Delete('/api/contacts/:contactId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete contact' })
  @ApiParam({ name: 'contactId', description: 'Contact ID' })
  @ApiResponse({
    status: 200,
    description: 'Contact deleted successfully',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Insufficient permissions' })
  @ApiResponse({ status: 404, description: 'Contact not found' })
  async remove(
    @Request() req: AuthenticatedRequest,
    @Param('contactId') contactId: string,
  ) {
    const userId = req.user.id;
    return this.contactsService.remove(contactId, userId);
  }
}
