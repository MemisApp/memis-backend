import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PrismaModule } from '../../prisma/prisma.module';
import { NotifyModule } from '../../common/notify/notify.module';
import { CareController } from './care.controller';
import { MedicationsService } from './medications.service';
import { MedicationsScheduler } from './medications.scheduler';
import { JournalService } from './journal.service';

@Module({
  imports: [PrismaModule, ConfigModule, JwtModule.register({}), NotifyModule],
  controllers: [CareController],
  providers: [MedicationsService, MedicationsScheduler, JournalService],
  exports: [MedicationsService, JournalService],
})
export class CareModule {}
