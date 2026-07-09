import { IsIn, IsNumber, IsOptional, Max, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ReportLocationDto {
  @ApiProperty({ example: 54.6872 })
  @IsNumber()
  @Min(-90)
  @Max(90)
  latitude!: number;

  @ApiProperty({ example: 25.2797 })
  @IsNumber()
  @Min(-180)
  @Max(180)
  longitude!: number;

  @ApiPropertyOptional({ description: 'Accuracy in metres' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  accuracyM?: number;

  @ApiPropertyOptional({ description: 'Battery level 0-1' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  battery?: number;

  @ApiPropertyOptional({ enum: ['app', 'background', 'sos'] })
  @IsOptional()
  @IsIn(['app', 'background', 'sos'])
  source?: 'app' | 'background' | 'sos';
}
