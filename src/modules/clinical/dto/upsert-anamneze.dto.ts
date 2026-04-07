import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class UpsertAnamnezeDto {
  @ApiProperty({ example: 'Patient reports progressive short-term memory decline.' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(20000)
  content!: string;
}
