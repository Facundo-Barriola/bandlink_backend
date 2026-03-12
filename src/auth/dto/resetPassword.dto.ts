import { IsString, MinLength } from 'class-validator';

export class ResetPasswordDTO {
  @IsString()
  token!: string;

  @IsString()
  @MinLength(6)
  newPassword!: string;
}