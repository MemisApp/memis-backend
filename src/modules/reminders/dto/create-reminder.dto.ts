import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsBoolean,
  MaxLength,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateReminderDto {
  @ApiProperty({
    example: 'PILLS',
    description: 'Reminder type',
    enum: ['PILLS', 'DOOR_LOCK', 'TEETH', 'PET_CARE', 'CUSTOM'],
  })
  @IsString()
  @IsNotEmpty()
  type!: string;

  @ApiProperty({
    example: 'Take morning medication',
    description: 'Reminder title',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  title!: string;

  @ApiProperty({
    example: 'Take with food',
    description: 'Additional notes',
    required: false,
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;

  @ApiProperty({
    example: '08:00',
    description: 'Schedule (HH:MM format or cron)',
    required: false,
  })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  schedule?: string;

  @ApiProperty({
    example: true,
    description: 'Whether reminder is active',
    required: false,
  })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
