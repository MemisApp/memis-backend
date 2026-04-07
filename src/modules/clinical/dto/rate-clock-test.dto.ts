import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class RateClockTestDto {
  @IsInt()
  @Min(1)
  @Max(5)
  rating!: number;

  @IsOptional()
  @IsString()
  note?: string;
}
