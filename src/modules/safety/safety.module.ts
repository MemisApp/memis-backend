import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PrismaModule } from '../../prisma/prisma.module';
import { NotifyModule } from '../../common/notify/notify.module';
import { SafetyController } from './safety.controller';
import { LocationService } from './location.service';
import { CheckInService } from './checkin.service';
import { CareSettingsService } from './care-settings.service';
import { SafetyScheduler } from './safety.scheduler';

@Module({
  imports: [PrismaModule, ConfigModule, JwtModule.register({}), NotifyModule],
  controllers: [SafetyController],
  providers: [
    LocationService,
    CheckInService,
    CareSettingsService,
    SafetyScheduler,
  ],
  exports: [LocationService, CheckInService],
})
export class SafetyModule {}
