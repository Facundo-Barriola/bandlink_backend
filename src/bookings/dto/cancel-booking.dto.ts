import { IsOptional, IsString, MaxLength } from 'class-validator';

export class CancelBookingDTO {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}