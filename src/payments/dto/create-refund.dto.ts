import { IsNumber, IsOptional, IsString, MaxLength, Min } from 'class-validator';

export class CreateRefundDTO {
    @IsOptional()
    @IsNumber()
    @Min(0.01)
    amount?: number;

    @IsOptional()
    @IsString()
    @MaxLength(255)
    reason?: string;
}
