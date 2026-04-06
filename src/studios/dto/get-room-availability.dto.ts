import { Type } from 'class-transformer';
import { IsDateString, IsInt, IsOptional, Min } from 'class-validator';

export class GetRoomAvailabilityDTO {
    @IsDateString()
    date!: string;

    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    durationMinutes?: number;

    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    slotStepMinutes?: number;
}