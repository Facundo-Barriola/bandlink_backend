import { IsInt, IsOptional, IsString, IsUUID, Min } from 'class-validator';

export class AttachBandMediaDTO {
  @IsUUID()
  media_id: string;

  @IsString()
  kind: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  sort_order?: number;
}