import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PrismaModule } from '../../prisma/prisma.module';
import { ClinicalController } from './clinical.controller';
import { ClinicalService } from './clinical.service';
import { FcmService } from './fcm.service';
import { PushService } from './push.service';

@Module({
  imports: [PrismaModule, ConfigModule, JwtModule.register({})],
  controllers: [ClinicalController],
  providers: [ClinicalService, FcmService, PushService],
  exports: [ClinicalService, FcmService, PushService],
})
export class ClinicalModule {}
