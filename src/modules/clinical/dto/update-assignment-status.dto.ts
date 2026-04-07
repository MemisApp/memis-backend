import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsString } from 'class-validator';

export class UpdateAssignmentStatusDto {
  @ApiProperty({ enum: ['ACTIVE', 'ARCHIVED'], example: 'ARCHIVED' })
  @IsString()
  @IsIn(['ACTIVE', 'ARCHIVED'])
  status!: 'ACTIVE' | 'ARCHIVED';
}
