import {
  IsString,
  IsNotEmpty,
  IsEmail,
  IsOptional,
  IsEnum,
  MinLength,
  MaxLength,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Role } from '@prisma/client';

export class CreateUserDto {
  @ApiProperty({
    example: 'John',
    description: 'User first name',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  firstName!: string;

  @ApiProperty({
    example: 'Doe',
    description: 'User last name',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  lastName!: string;

  @ApiProperty({
    example: 'john.doe@example.com',
    description: 'User email address',
  })
  @IsEmail()
  @IsNotEmpty()
  email!: string;

  @ApiProperty({
    example: 'SecurePassword123!',
    description: 'User password (minimum 8 characters)',
    minLength: 8,
  })
  @IsString()
  @IsNotEmpty()
  @MinLength(8)
  password!: string;

  @ApiProperty({
    example: 'CAREGIVER',
    description: 'User role',
    enum: Role,
    default: Role.CAREGIVER,
    required: false,
  })
  @IsOptional()
  @IsEnum(Role)
  role?: Role;

  @ApiProperty({
    example: '+1234567890',
    description: 'User phone number',
    required: false,
  })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  phone?: string;
}
