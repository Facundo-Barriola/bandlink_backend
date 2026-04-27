import { IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class CreateOpeningDTO {
  @IsUUID()
  instrument_id!: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @IsOptional()
  @IsUUID()
  place_id?: string;
}