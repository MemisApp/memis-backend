import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsString, MaxLength } from 'class-validator';

export class OpenDmDto {
  @ApiProperty({ enum: ['user', 'patient'] })
  @IsIn(['user', 'patient'])
  kind!: 'user' | 'patient';

  @ApiProperty({ description: 'The other member id (userId or patientId).' })
  @IsString()
  @MaxLength(64)
  id!: string;
}
