import { IsOptional, IsUUID, Matches } from 'class-validator';

export class GetStudioBookingHistoryDTO {
  @IsOptional()
  @IsUUID()
  roomId?: string;

  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'date debe tener formato YYYY-MM-DD',
  })
  date?: string;
}