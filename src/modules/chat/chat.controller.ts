import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { ChatService, Actor } from './chat.service';
import { OpenDmDto } from './dto/open-dm.dto';
import { SendChatMessageDto } from './dto/send-chat-message.dto';

type AuthedRequest = Request & { user: { id: string; role: string } };

function actorOf(req: AuthedRequest): Actor {
  return req.user.role === 'PATIENT'
    ? { kind: 'patient', id: req.user.id }
    : { kind: 'user', id: req.user.id };
}

@ApiTags('chat')
@Controller('/api/chat')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth('access-token')
export class ChatController {
  constructor(private readonly chat: ChatService) {}

  @Get('circles')
  @ApiOperation({ summary: 'List care circles with members + group room' })
  listCircles(@Req() req: AuthedRequest) {
    return this.chat.listCircles(actorOf(req));
  }

  @Get('circles/:patientId/group')
  @ApiOperation({ summary: 'Get (or provision) the family group room' })
  async getGroup(
    @Req() req: AuthedRequest,
    @Param('patientId') patientId: string,
  ) {
    const actor = actorOf(req);
    await this.chat.assertInCircle(actor, patientId);
    return this.chat.ensureGroupRoom(patientId);
  }

  @Post('circles/:patientId/dm')
  @ApiOperation({ summary: 'Open (or provision) a 1:1 DM with a member' })
  openDm(
    @Req() req: AuthedRequest,
    @Param('patientId') patientId: string,
    @Body() dto: OpenDmDto,
  ) {
    return this.chat.ensureDmRoom(actorOf(req), patientId, {
      kind: dto.kind,
      id: dto.id,
    });
  }

  @Get('rooms/:roomId/messages')
  @ApiOperation({ summary: 'List messages in a room' })
  getMessages(
    @Req() req: AuthedRequest,
    @Param('roomId') roomId: string,
    @Query('limit') limit?: string,
  ) {
    return this.chat.getRoomMessages(
      actorOf(req),
      roomId,
      limit ? parseInt(limit, 10) : 50,
    );
  }

  @Post('rooms/:roomId/messages')
  @ApiOperation({ summary: 'Send a message to a room' })
  send(
    @Req() req: AuthedRequest,
    @Param('roomId') roomId: string,
    @Body() dto: SendChatMessageDto,
  ) {
    return this.chat.sendMessage(actorOf(req), roomId, dto.content);
  }
}
