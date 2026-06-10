import { IsIn, IsISO8601, IsOptional, IsString } from 'class-validator';

export class LogMedicationDto {
  @IsString()
  medicationId!: string;

  @IsOptional()
  @IsIn(['TAKEN', 'SKIPPED', 'MISSED'])
  status?: 'TAKEN' | 'SKIPPED' | 'MISSED';

  @IsOptional()
  @IsISO8601()
  scheduledFor?: string;
}
