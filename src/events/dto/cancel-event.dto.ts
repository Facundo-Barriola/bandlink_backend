import { IsOptional, IsString, MaxLength } from 'class-validator';

export class CancelEventDTO {
  @IsOptional()
  @IsString()
  @MaxLength(255)
  cancel_reason?: string;
}