import { ApiProperty } from '@nestjs/swagger';
import {
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class CreateClockTestDto {
  @ApiProperty({
    description: 'Clock drawing image URL/base64 payload',
    example: 'data:image/png;base64,...',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000000)
  imageUrl!: string;

  @ApiProperty({
    required: false,
    description: 'Optional metadata (target time, hints used, etc.)',
    example: '{"targetTime":"08:20","step":"all"}',
  })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}
