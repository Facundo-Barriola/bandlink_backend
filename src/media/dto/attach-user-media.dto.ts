import { IsInt, IsOptional, IsString, IsUUID, Min } from 'class-validator';

export class AttachUserMediaDTO {
  @IsUUID()
  media_id: string;

  @IsString()
  kind: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  sort_order?: number;
}