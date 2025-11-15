import {
  Controller,
  Delete,
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
import { PatientsService } from '../patients/patients.service';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';

interface AuthenticatedRequest extends Request {
  user: {
    id: string;
    role: string;
  };
}

@ApiTags('pairing-codes')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard)
@Controller('/api/pairing-codes')
export class PairingCodesController {
  constructor(private readonly patientsService: PatientsService) {}

  @Delete('/:codeId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Revoke/expire pairing code' })
  @ApiParam({ name: 'codeId', description: 'Pairing code ID' })
  @ApiResponse({
    status: 200,
    description: 'Pairing code revoked successfully',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'No access to this pairing code' })
  @ApiResponse({ status: 404, description: 'Pairing code not found' })
  async revokePairingCode(
    @Request() req: AuthenticatedRequest,
    @Param('codeId') codeId: string,
  ) {
    const userId = req.user.id;
    return this.patientsService.revokePairingCode(codeId, userId);
  }
}
