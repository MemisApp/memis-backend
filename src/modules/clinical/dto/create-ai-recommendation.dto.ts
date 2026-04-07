import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateAiRecommendationDto {
  @ApiProperty({
    required: false,
    example: 'Suggest non-pharmacological treatment priorities for next month.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  prompt?: string;
}
