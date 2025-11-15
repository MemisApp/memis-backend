import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsDateString,
  MaxLength,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreatePatientDto {
  @ApiProperty({
    example: 'John',
    description: 'Patient first name',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  firstName!: string;

  @ApiProperty({
    example: 'Doe',
    description: 'Patient last name',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  lastName!: string;

  @ApiProperty({
    example: '1950-01-15',
    description: 'Patient birth date',
    required: false,
  })
  @IsOptional()
  @IsDateString()
  birthDate?: string;

  @ApiProperty({
    example: 'https://example.com/avatar.jpg',
    description: 'Patient avatar URL',
    required: false,
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  avatarUrl?: string;

  @ApiProperty({
    example: 'Loves reading and gardening',
    description: 'Short patient introduction',
    required: false,
  })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  shortIntro?: string;

  @ApiProperty({
    example: '1975-06-20',
    description: 'Patient marriage date',
    required: false,
  })
  @IsOptional()
  @IsDateString()
  maritalDate?: string;
}
