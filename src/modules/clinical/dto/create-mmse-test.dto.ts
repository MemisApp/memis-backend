import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsObject, IsOptional, IsString } from 'class-validator';

export class CreateMmseTestDto {
  @ApiProperty({
    description: 'Question answers map for MMSE',
    example: { orientationDate: 1, orientationPlace: 1, recallWords: 2 },
  })
  @IsObject()
  @IsNotEmpty()
  answers!: Record<string, unknown>;

  @ApiProperty({
    required: false,
    example: 'cmndoctor123',
    description: 'Optional doctor id that assigned this test',
  })
  @IsOptional()
  @IsString()
  assignedByDoctor?: string;
}
