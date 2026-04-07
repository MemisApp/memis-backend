import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsIn, IsOptional, IsString, MaxLength, Matches } from 'class-validator';

export class UpdateProfileDto {
  @ApiPropertyOptional({ example: 'Jane' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  @Matches(/^[a-zA-Z\s\-']+$/, {
    message:
      'First name can only contain letters, spaces, hyphens, and apostrophes',
  })
  @Transform(({ value }) => (value as string)?.trim())
  firstName?: string;

  @ApiPropertyOptional({ example: 'Doe' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  @Matches(/^[a-zA-Z\s\-']+$/, {
    message:
      'Last name can only contain letters, spaces, hyphens, and apostrophes',
  })
  @Transform(({ value }) => (value as string)?.trim())
  lastName?: string;

  @ApiPropertyOptional({ example: '+37060000000' })
  @IsOptional()
  @IsString()
  @MaxLength(25)
  phone?: string;

  @ApiPropertyOptional({
    example: 'file:///data/user/0/.../memis-images/123.jpg',
  })
  @IsOptional()
  @IsString()
  @MaxLength(2000000)
  avatarUrl?: string;

  @ApiPropertyOptional({
    enum: ['LSMUKK', 'KLAIPEDOS_LIGONINE', 'VU_LIGONINE'],
  })
  @IsOptional()
  @IsString()
  @IsIn(['LSMUKK', 'KLAIPEDOS_LIGONINE', 'VU_LIGONINE'])
  workplace?: 'LSMUKK' | 'KLAIPEDOS_LIGONINE' | 'VU_LIGONINE';

  @ApiPropertyOptional({ example: 'Neurologist' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  profession?: string;

  @ApiPropertyOptional({ example: 'MD, PhD' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  title?: string;
}
