import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PairingCodesController } from './pairing-codes.controller';
import { PatientsModule } from '../patients/patients.module';
import { PrismaModule } from '../../prisma/prisma.module';

@Module({
  imports: [PrismaModule, ConfigModule, JwtModule.register({}), PatientsModule],
  controllers: [PairingCodesController],
})
export class PairingCodesModule {}
