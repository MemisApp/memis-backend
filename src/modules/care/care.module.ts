import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PrismaModule } from '../../prisma/prisma.module';
import { CareController } from './care.controller';
import { MedicationsService } from './medications.service';
import { JournalService } from './journal.service';

@Module({
  imports: [PrismaModule, JwtModule.register({})],
  controllers: [CareController],
  providers: [MedicationsService, JournalService],
  exports: [MedicationsService, JournalService],
})
export class CareModule {}
