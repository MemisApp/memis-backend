import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class CreateDoctorNoteDto {
  @ApiProperty({ example: 'Family requests more education on evening agitation handling.' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(8000)
  content!: string;
}
