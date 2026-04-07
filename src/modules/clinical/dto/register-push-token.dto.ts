import { IsString } from 'class-validator';

export class RegisterPushTokenDto {
  @IsString()
  devicePublicId!: string;

  @IsString()
  token!: string;
}
