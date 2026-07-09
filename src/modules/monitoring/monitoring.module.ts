import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PrismaModule } from '../../prisma/prisma.module';
import { NotifyModule } from '../../common/notify/notify.module';
import { ClinicalModule } from '../clinical/clinical.module';
import { MonitoringController } from './monitoring.controller';
import { CognitiveService } from './cognitive.service';
import { DigestService } from './digest.service';
import { MonitoringScheduler } from './monitoring.scheduler';

@Module({
  imports: [
    PrismaModule,
    ConfigModule,
    JwtModule.register({}),
    NotifyModule,
    ClinicalModule,
  ],
  controllers: [MonitoringController],
  providers: [CognitiveService, DigestService, MonitoringScheduler],
  exports: [CognitiveService, DigestService],
})
export class MonitoringModule {}
