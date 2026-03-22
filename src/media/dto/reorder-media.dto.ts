import { ArrayMinSize, IsArray, IsInt, IsUUID, Min, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

class ReorderItemDTO {
  @IsUUID()
  media_id: string;

  @IsInt()
  @Min(0)
  sort_order: number;
}

export class ReorderMediaDTO {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ReorderItemDTO)
  items: ReorderItemDTO[];
}