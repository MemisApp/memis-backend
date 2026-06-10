import {
  IsArray,
  IsISO8601,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class UpsertJournalEntryDto {
  @IsOptional()
  @IsISO8601()
  entryDate?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  mood?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(24)
  sleepHours?: number;

  @IsOptional()
  @IsArray()
  symptoms?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string;
}
