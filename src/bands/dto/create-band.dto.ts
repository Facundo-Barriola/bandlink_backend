import { IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class CreateBandDTO {
  @IsString()
  @MaxLength(120)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @IsOptional()
  @IsUUID()
  place_id?: string;
}