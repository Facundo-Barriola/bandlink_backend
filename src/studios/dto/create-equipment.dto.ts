import { IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateEquipmentDTO {
  @IsString()
  @MaxLength(120)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  category?: string;
}