import { IsBoolean, IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateCareSettingsDto {
  @ApiPropertyOptional({ description: 'Enable the daily "I\'m OK" check-in' })
  @IsOptional()
  @IsBoolean()
  checkInEnabled?: boolean;

  @ApiPropertyOptional({ description: 'Local hour (0-23) the check-in is due by' })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(23)
  checkInByHour?: number;

  @ApiPropertyOptional({ description: 'Enable cognitive decline monitoring' })
  @IsOptional()
  @IsBoolean()
  cognitiveMonitoringEnabled?: boolean;

  @ApiPropertyOptional({ enum: ['OFF', 'DAILY', 'WEEKLY'] })
  @IsOptional()
  @IsIn(['OFF', 'DAILY', 'WEEKLY'])
  digestFrequency?: 'OFF' | 'DAILY' | 'WEEKLY';
}
