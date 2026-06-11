import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEmail, IsIn, IsOptional, MaxLength } from 'class-validator';

export class CreateInviteDto {
  @ApiProperty({ example: 'family.member@example.com' })
  @IsEmail({}, { message: 'Please provide a valid email address' })
  @Transform(({ value }) => (value as string)?.trim()?.toLowerCase())
  @MaxLength(254)
  email!: string;

  @ApiProperty({
    enum: ['EDITOR', 'VIEWER'],
    required: false,
    default: 'VIEWER',
  })
  @IsOptional()
  @IsIn(['EDITOR', 'VIEWER'])
  role?: 'EDITOR' | 'VIEWER';
}
