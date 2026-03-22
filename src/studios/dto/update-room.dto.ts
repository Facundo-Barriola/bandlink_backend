import { IsBoolean, IsInt, IsNumber, IsOptional, IsString, MaxLength, Min } from 'class-validator';

export class UpdateRoomDTO {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  capacity?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  base_hourly_price?: number;

  @IsOptional()
  @IsInt()
  @Min(15)
  min_booking_minutes?: number;

  @IsBoolean()
  is_active?: boolean;
}