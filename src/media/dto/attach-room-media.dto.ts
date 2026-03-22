import { IsInt, IsOptional, IsString, IsUUID, Min } from 'class-validator';

export class AttachRoomMediaDTO {
  @IsUUID()
  media_id: string;

  @IsString()
  kind: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  sort_order?: number;
}