import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PrismaModule } from '../../prisma/prisma.module';
import { ChatModule } from '../chat/chat.module';
import { InvitesController } from './invites.controller';
import { InvitesService } from './invites.service';

@Module({
  imports: [PrismaModule, ConfigModule, JwtModule.register({}), ChatModule],
  controllers: [InvitesController],
  providers: [InvitesService],
})
export class InvitesModule {}
