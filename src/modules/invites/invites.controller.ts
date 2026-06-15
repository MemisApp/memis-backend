import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CaregiverRole } from '@prisma/client';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { InvitesService } from './invites.service';
import { CreateInviteDto } from './dto/create-invite.dto';
import { AcceptInviteDto } from './dto/accept-invite.dto';

type AuthedRequest = Request & { user: { id: string; role: string } };

@ApiTags('invites')
@Controller('/api')
export class InvitesController {
  constructor(private readonly invites: InvitesService) {}

  @Post('patients/:patientId/invites')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Invite a family member / caregiver by email' })
  create(
    @Req() req: AuthedRequest,
    @Param('patientId') patientId: string,
    @Body() dto: CreateInviteDto,
  ) {
    return this.invites.createInvite(
      req.user.id,
      patientId,
      dto.email,
      (dto.role ?? 'VIEWER') as CaregiverRole,
    );
  }

  @Get('patients/:patientId/invites')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'List invites for a patient circle' })
  list(@Req() req: AuthedRequest, @Param('patientId') patientId: string) {
    return this.invites.listInvites(req.user.id, patientId);
  }

  @Delete('invites/:inviteId')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Revoke a pending invite' })
  revoke(@Req() req: AuthedRequest, @Param('inviteId') inviteId: string) {
    return this.invites.revokeInvite(req.user.id, inviteId);
  }

  // Public: a new invitee isn't signed in yet when previewing their invite.
  @Get('invites/lookup')
  @ApiOperation({
    summary: 'Preview an invite by token (for the accept screen)',
  })
  lookup(@Query('token') token: string) {
    return this.invites.lookup(token);
  }

  @Post('invites/accept')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Accept an invite and join the care circle' })
  accept(@Req() req: AuthedRequest, @Body() dto: AcceptInviteDto) {
    return this.invites.accept(req.user.id, dto.token);
  }
}
