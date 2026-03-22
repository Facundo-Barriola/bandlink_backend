import { IsInt, IsOptional, IsString, IsUrl, Min } from 'class-validator';

export class ConfirmUploadDTO {
  @IsString()
  storageKey: string;

  @IsUrl()
  url: string;

  @IsString()
  mimeType: string;

  @IsString()
  mediaType: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  width?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  height?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  durationSeconds?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  sizeBytes?: number;
}