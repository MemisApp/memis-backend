import { IsString, IsOptional, IsBoolean, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UpdateDeviceDto {
  @ApiProperty({
    example: 'My iPhone',
    description: 'Device name',
    required: false,
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  deviceName?: string;

  @ApiProperty({
    example: true,
    description: 'Set as primary device',
    required: false,
  })
  @IsOptional()
  @IsBoolean()
  isPrimary?: boolean;
}
