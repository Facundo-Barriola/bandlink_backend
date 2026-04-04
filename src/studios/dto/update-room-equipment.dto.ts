import { IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateRoomEquipmentDTO {
  @IsOptional()
  @IsString()
  @MaxLength(50)
  quantity?: string;
}