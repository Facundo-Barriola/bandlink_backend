import { IsInt,IsString, MaxLength, Min } from 'class-validator';

export class CreateMusicianDTO  {
    
    @IsInt()
    @Min(0)
    experience!: number;

    @IsString()
    @MaxLength(500)
    summary!: string;
}