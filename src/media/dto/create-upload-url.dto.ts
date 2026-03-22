import { IsIn, IsInt, IsOptional, IsString, Min } from 'class-validator';

export class CreateUploadUrlDTO {
  @IsString()
  mimeType: string;

  @IsString()
  @IsIn(['image', 'video', 'audio', 'document'])
  mediaType: string;

  @IsString()
  originalFilename: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  sizeBytes?: number;
}