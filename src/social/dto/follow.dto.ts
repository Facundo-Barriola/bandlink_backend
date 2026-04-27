import { IsIn, IsUUID } from 'class-validator';

export class FollowDTO {
  @IsIn(['user', 'band', 'event'])
  target_type!: string;

  @IsUUID()
  target_id!: string;
}