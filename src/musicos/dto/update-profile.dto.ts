import { IsInt,IsString, IsOptional, MaxLength, Min, IsEnum, IsUUID, IsIn, IsBoolean, IsArray, ValidateNested} from 'class-validator';
import { Type } from 'class-transformer';
export enum ProfileVisibility {
  PUBLIC = 'public',
  PRIVATE = 'private',
}

export class UpdateProfileDTO {
    @IsOptional()
  @IsString()
  @MaxLength(100)
  display_name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  bio?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  phone?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  years_experience?: number;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  skill_summary?: string;

  @IsOptional()
  @IsEnum(ProfileVisibility)
  profile_visibility?: ProfileVisibility;

}