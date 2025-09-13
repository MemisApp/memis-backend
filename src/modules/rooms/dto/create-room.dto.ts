import { IsEnum, IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export enum RoomVisibilityEnum {
  PRIVATE = 'PRIVATE',
  PUBLIC = 'PUBLIC',
}

export class CreateRoomDto {
  @ApiProperty({
    example: 'General Discussion',
    description: 'Room name',
    maxLength: 80,
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  name!: string;

  @ApiProperty({
    enum: RoomVisibilityEnum,
    example: RoomVisibilityEnum.PRIVATE,
    description: 'Room visibility setting',
  })
  @IsEnum(RoomVisibilityEnum)
  visibility: RoomVisibilityEnum = RoomVisibilityEnum.PRIVATE;
}
