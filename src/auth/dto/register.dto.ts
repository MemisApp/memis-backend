import {
  IsEmail,
  IsNotEmpty,
  MinLength,
  MaxLength,
  Matches,
  IsString,
  IsIn,
  ValidateIf,
  IsOptional,
  IsBoolean,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';

export class RegisterDto {
  @ApiProperty({ example: 'jane.doe@example.com' })
  @IsEmail({}, { message: 'Please provide a valid email address' })
  @Transform(({ value }) => (value as string)?.trim()?.toLowerCase())
  @MaxLength(254, { message: 'Email must not exceed 254 characters' })
  email!: string;

  @ApiProperty({ minLength: 8, maxLength: 32, example: 'StrongP@ssw0rd' })
  @IsString()
  @MinLength(8, { message: 'Password must be at least 8 characters long' })
  @MaxLength(32, { message: 'Password must not exceed 32 characters' })
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/, {
    message:
      'Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character',
  })
  password!: string;

  @ApiProperty({ example: 'Jane' })
  @IsString()
  @IsNotEmpty({ message: 'First name is required' })
  @MaxLength(50, { message: 'First name must not exceed 50 characters' })
  @Matches(/^[a-zA-Z\s\-']+$/, {
    message:
      'First name can only contain letters, spaces, hyphens, and apostrophes',
  })
  @Transform(({ value }) => (value as string)?.trim())
  firstName!: string;

  @ApiProperty({ example: 'Doe' })
  @IsString()
  @IsNotEmpty({ message: 'Last name is required' })
  @MaxLength(50, { message: 'Last name must not exceed 50 characters' })
  @Matches(/^[a-zA-Z\s\-']+$/, {
    message:
      'Last name can only contain letters, spaces, hyphens, and apostrophes',
  })
  @Transform(({ value }) => (value as string)?.trim())
  lastName!: string;

  // SECURITY: Doctor self-registration is DISABLED for launch. Allowing anyone
  // to self-register as a DOCTOR would grant clinical/PHI access without any
  // verification of medical credentials. Doctors must be provisioned by an
  // admin. To re-enable later, add 'DOCTOR' back to the @IsIn list and the
  // union type below (and re-enable the doctor option in the frontend).
  @ApiProperty({
    enum: ['CAREGIVER' /* , 'DOCTOR' */],
    example: 'CAREGIVER',
  })
  @IsString()
  // SECURITY: runtime validation only permits CAREGIVER. The TS union keeps
  // 'DOCTOR' so the (retained but inert) doctor-field code still type-checks.
  @IsIn(['CAREGIVER' /* , 'DOCTOR' */])
  role!: 'CAREGIVER' | 'DOCTOR';

  @ApiProperty({ example: true, description: 'User accepted Terms of Service' })
  @IsBoolean()
  acceptedTerms!: boolean;

  @ApiProperty({ example: true, description: 'User accepted Privacy Policy' })
  @IsBoolean()
  acceptedPrivacy!: boolean;

  @ApiPropertyOptional({
    example: 'data:image/jpeg;base64,...',
  })
  @IsOptional()
  @IsString()
  @MaxLength(2000000)
  avatarUrl?: string;

  @ApiProperty({
    enum: ['LSMUKK', 'KLAIPEDOS_LIGONINE', 'VU_LIGONINE'],
    required: false,
  })
  @ValidateIf((o: RegisterDto) => o.role === 'DOCTOR')
  @IsString()
  @IsIn(['LSMUKK', 'KLAIPEDOS_LIGONINE', 'VU_LIGONINE'])
  workplace?: 'LSMUKK' | 'KLAIPEDOS_LIGONINE' | 'VU_LIGONINE';

  @ApiProperty({ example: 'Neurologist', required: false })
  @ValidateIf((o: RegisterDto) => o.role === 'DOCTOR')
  @IsString()
  @IsNotEmpty({ message: 'Profession is required for doctors' })
  @MaxLength(120)
  profession?: string;

  @ApiProperty({ example: 'MD, PhD', required: false })
  @ValidateIf((o: RegisterDto) => o.role === 'DOCTOR')
  @IsString()
  @IsNotEmpty({ message: 'Title is required for doctors' })
  @MaxLength(120)
  title?: string;
}
