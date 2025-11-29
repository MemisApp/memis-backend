import { PartialType } from '@nestjs/mapped-types';
import { CreateUserDto } from './create-user.dto';
import { IsOptional, IsEnum } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Role } from '@prisma/client';

export class UpdateUserDto extends PartialType(CreateUserDto) {
  @ApiProperty({
    example: 'ADMIN',
    description: 'User role',
    enum: Role,
    required: false,
  })
  @IsOptional()
  @IsEnum(Role)
  role?: Role;
}
