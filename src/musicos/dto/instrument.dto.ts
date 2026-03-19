import { IsBoolean, IsOptional, IsString, IsUUID } from 'class-validator';

export class AddInstrumentDTO {
  @IsUUID()
  instrument_id: string;

  @IsOptional()
  @IsString()
  level?: string;

  @IsOptional()
  @IsBoolean()
  is_primary?: boolean;
}

export class UpdateInstrumentDTO {
  @IsOptional()
  @IsString()
  level?: string;

  @IsOptional()
  @IsBoolean()
  is_primary?: boolean;
}