import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class AssignPatientDto {
  @ApiProperty({ example: 'cmn123patient' })
  @IsString()
  @IsNotEmpty()
  patientId!: string;
}
