import { Type } from 'class-transformer';
import {
  IsDate,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
} from 'class-validator';

export class UpdateEventDTO {
  @IsOptional()
  @IsUUID()
  host_band_id?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  description?: string;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  starts_at?: Date;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  ends_at?: Date;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  timezone?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  capacity?: number;

  @IsOptional()
  @IsString()
  @IsIn(['public', 'private'])
  visibility?: string;

  @IsOptional()
  @IsUUID()
  place_id?: string;
}