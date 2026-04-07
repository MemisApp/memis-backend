import { IsString, IsNotEmpty, IsOptional, MaxLength, IsBoolean } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateContactDto {
  @ApiProperty({
    example: 'DAUGHTER',
    description: 'Relationship to patient',
    enum: ['SISTER', 'SPOUSE', 'CHILD', 'FRIEND', 'OTHER'],
  })
  @IsString()
  @IsNotEmpty()
  relation!: string;

  @ApiProperty({
    example: 'Sarah Johnson',
    description: 'Contact name',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name!: string;

  @ApiProperty({
    example: '+1234567890',
    description: 'Contact phone number',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(20)
  phone!: string;

  @ApiProperty({
    example: 'https://example.com/photo.jpg',
    description: 'Contact photo URL',
    required: false,
  })
  @IsOptional()
  @IsString()
  @MaxLength(2000000)
  photoUrl?: string;

  @ApiProperty({
    example: 'Close family friend and neighbor',
    description: 'Contact description',
    required: false,
  })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  description?: string;

  @ApiProperty({
    example: true,
    description: 'Whether this is an emergency contact',
    required: false,
  })
  @IsOptional()
  @IsBoolean()
  isEmergencyContact?: boolean;
}
