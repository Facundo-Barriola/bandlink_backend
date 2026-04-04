import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, IsUUID, MaxLength, Max, Min,  IsDate } from 'class-validator';


export class CreateEventDTO {

    @IsUUID()
    @IsOptional()
    host_band_id?: string;

    @IsString()
    @Max(30)
    title!: string;

    @IsString()
    @Max(255)
    @IsOptional()
    description?: string;

    @IsOptional()
    @Type(() => Date)
    @IsDate()
    starts_at?: Date;

    @IsOptional()
    @Type(() => Date)
    @IsDate()
    ends_at?: Date;

    @IsOptional()
    @IsString()
    @MaxLength(100)
    timezone?: string;

    @IsOptional()
    @IsInt()
    @Min(1)
    capacity?: number;

    @IsOptional()
    @IsString()
    @IsIn(['public', 'private'])
    visibility?: string;

    @IsOptional()
    @IsUUID()
    place_id?: string;



}