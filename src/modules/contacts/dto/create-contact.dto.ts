import { IsString, IsNotEmpty, IsOptional, MaxLength } from 'class-validator';
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
  @MaxLength(500)
  photoUrl?: string;
}
