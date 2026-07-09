import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { ClinicalModule } from '../../modules/clinical/clinical.module';
import { NotifyService } from './notify.service';

@Module({
  imports: [PrismaModule, ClinicalModule],
  providers: [NotifyService],
  exports: [NotifyService],
})
export class NotifyModule {}
