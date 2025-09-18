import { IsString, IsNotEmpty, IsEnum } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export enum RoomMemberRoleEnum {
  OWNER = 'OWNER',
  MODERATOR = 'MODERATOR',
  MEMBER = 'MEMBER',
}

export class AddMemberDto {
  @ApiProperty({
    example: 'clm1example000000000000000',
    description: 'User ID to add to room',
  })
  @IsString()
  @IsNotEmpty()
  userId!: string;

  @ApiProperty({
    example: 'MEMBER',
    description: 'Role to assign to user',
    enum: RoomMemberRoleEnum,
  })
  @IsEnum(RoomMemberRoleEnum)
  role!: RoomMemberRoleEnum;
}
