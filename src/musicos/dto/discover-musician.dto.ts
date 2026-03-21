import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, IsUUID, Max, Min } from 'class-validator';

export class DiscoverMusiciansDTO {
  @IsOptional()
  @IsString()
  q?: string;

  @IsOptional()
  @IsUUID()
  instrument_id?: string;

  @IsOptional()
  @IsUUID()
  genre_id?: string;

  @IsOptional()
  @IsString()
  level?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number = 12;
}