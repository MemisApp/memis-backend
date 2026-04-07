import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class CreateTreatmentDto {
  @ApiProperty({ example: 'Donepezil 5mg daily and cognitive stimulation routine.' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(5000)
  description!: string;
}
