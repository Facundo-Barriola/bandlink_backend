import { Type } from 'class-transformer';
import { IsDate, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateRoomBlockDTO {
  @Type(() => Date)
  @IsDate()
  starts_at!: Date;

  @Type(() => Date)
  @IsDate()
  ends_at!: Date;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  reason?: string;
}