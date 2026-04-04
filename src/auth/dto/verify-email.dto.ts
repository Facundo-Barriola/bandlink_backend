import { IsString, MinLength } from 'class-validator';

export class VerifyEmailDTO {
  @IsString()
  @MinLength(10)
  token!: string;
}