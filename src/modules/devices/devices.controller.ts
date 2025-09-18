import {
  Controller,
  Get,
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
import { DevicesService } from './devices.service';
import { UpdateDeviceDto } from './dto/update-device.dto';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';

interface AuthenticatedRequest extends Request {
  user: {
    id: string;
    role: string;
  };
}

@ApiTags('devices')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard)
@Controller()
export class DevicesController {
  constructor(private readonly devicesService: DevicesService) {}

  @Get('/api/patients/:patientId/devices')
  @ApiOperation({ summary: 'Get patient\'s registered devices' })
  @ApiParam({ name: 'patientId', description: 'Patient ID' })
  @ApiResponse({
    status: 200,
    description: 'Successfully retrieved devices',
    schema: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          platform: { type: 'string' },
          devicePublicId: { type: 'string' },
          deviceName: { type: 'string', nullable: true },
          isPrimary: { type: 'boolean' },
          lastSeenAt: { type: 'string', format: 'date-time', nullable: true },
          createdAt: { type: 'string', format: 'date-time' },
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
    return this.devicesService.findByPatient(patientId, userId);
  }

  @Put('/api/devices/:deviceId')
  @ApiOperation({ summary: 'Update device (rename, set as primary)' })
  @ApiParam({ name: 'deviceId', description: 'Device ID' })
  @ApiResponse({
    status: 200,
    description: 'Device updated successfully',
    schema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        platform: { type: 'string' },
        devicePublicId: { type: 'string' },
        deviceName: { type: 'string', nullable: true },
        isPrimary: { type: 'boolean' },
        lastSeenAt: { type: 'string', format: 'date-time', nullable: true },
        createdAt: { type: 'string', format: 'date-time' },
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Invalid request body' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'No access to this device' })
  @ApiResponse({ status: 404, description: 'Device not found' })
  async update(
    @Request() req: AuthenticatedRequest,
    @Param('deviceId') deviceId: string,
    @Body() updateDeviceDto: UpdateDeviceDto,
  ) {
    const userId = req.user.id;
    return this.devicesService.update(deviceId, userId, updateDeviceDto);
  }

  @Delete('/api/devices/:deviceId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Remove/revoke device' })
  @ApiParam({ name: 'deviceId', description: 'Device ID' })
  @ApiResponse({
    status: 200,
    description: 'Device removed successfully',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'No access to this device' })
  @ApiResponse({ status: 404, description: 'Device not found' })
  async remove(
    @Request() req: AuthenticatedRequest,
    @Param('deviceId') deviceId: string,
  ) {
    const userId = req.user.id;
    return this.devicesService.remove(deviceId, userId);
  }
}
