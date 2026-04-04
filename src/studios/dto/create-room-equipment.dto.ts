import { IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class CreateRoomEquipmentDTO {
  @IsUUID()
  equipment_id!: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  quantity?: string;
}