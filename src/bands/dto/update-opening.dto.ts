import { IsIn, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class UpdateOpeningDTO {
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @IsOptional()
  @IsUUID()
  place_id?: string;

  @IsOptional()
  @IsIn(['Abierta', 'Cerrada'])
  status?: string;
}