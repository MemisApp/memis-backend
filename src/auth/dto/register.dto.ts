import { IsEmail, IsNotEmpty, MinLength, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class RegisterDto {
  @ApiProperty({ example: 'jane.doe@example.com' })
  @IsEmail()
  email!: string;

  @ApiProperty({ minLength: 8, maxLength: 32, example: 'StrongP@ssw0rd' })
  @MinLength(8)
  @MaxLength(32)
  password!: string;

  @ApiProperty({ example: 'Jane' })
  @IsNotEmpty()
  firstName!: string;

  @ApiProperty({ example: 'Doe' })
  @IsNotEmpty()
  lastName!: string;
}
