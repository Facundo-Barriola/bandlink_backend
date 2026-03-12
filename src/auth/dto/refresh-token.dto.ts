import { IsString } from 'class-validator';

export class RefreshTokenDTO {
  @IsString()
  sessionId!: string;

  @IsString()
  refreshToken!: string;
}