import { IsArray, IsUUID } from 'class-validator';

export class AddGenresDTO {
  @IsArray()
  @IsUUID('4', { each: true })
  genre_ids: string[];
}