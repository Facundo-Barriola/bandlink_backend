import { Type } from 'class-transformer';
import { IsDate, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class CreateBookingHoldDTO {
  @IsUUID()
  room_id!: string;

  @Type(() => Date)
  @IsDate()
  starts_at!: Date;

  @Type(() => Date)
  @IsDate()
  ends_at!: Date;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}