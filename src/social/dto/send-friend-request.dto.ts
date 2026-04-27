import { IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class SendFriendRequestDTO {
  @IsUUID()
  to_user_id!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  message?: string;
}