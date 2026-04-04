import { IsInt, IsString, Matches, MaxLength, Min, Max } from 'class-validator';

export class CreateRoomAvailabilityRuleDTO {
  @IsInt()
  @Min(0)
  @Max(6)
  day_of_week!: number;

  @IsString()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/)
  start_time!: string;

  @IsString()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/)
  end_time!: string;

  @IsString()
  @MaxLength(80)
  timezone!: string;
}