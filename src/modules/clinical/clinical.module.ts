import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PrismaModule } from '../../prisma/prisma.module';
import { ClinicalController } from './clinical.controller';
import { ClinicalService } from './clinical.service';
import { PushService } from './push.service';

@Module({
  imports: [PrismaModule, ConfigModule, JwtModule.register({})],
  controllers: [ClinicalController],
  providers: [ClinicalService, PushService],
  exports: [ClinicalService, PushService],
})
export class ClinicalModule {}
