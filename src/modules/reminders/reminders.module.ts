import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { RemindersController } from './reminders.controller';
import { RemindersService } from './reminders.service';
import { RemindersScheduler } from './reminders.scheduler';
import { PrismaModule } from '../../prisma/prisma.module';
import { ClinicalModule } from '../clinical/clinical.module';

@Module({
  imports: [PrismaModule, ConfigModule, JwtModule.register({}), ClinicalModule],
  controllers: [RemindersController],
  providers: [RemindersService, RemindersScheduler],
  exports: [RemindersService],
})
export class RemindersModule {}
