import { IsString, IsOptional, IsNumber, IsInt, IsBoolean } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateMenuItemDto {
  @ApiProperty() @IsString() categoryId: string;
  @ApiProperty() @IsString() name: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() description?: string;
  @ApiProperty() @IsNumber() price: number;
  @ApiProperty({ required: false }) @IsOptional() @IsNumber() costPrice?: number;
  @ApiProperty({ required: false }) @IsOptional() @IsString() image?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsBoolean() isAvailable?: boolean;
  @ApiProperty({ required: false }) @IsOptional() @IsBoolean() isConvenience?: boolean;
  @ApiProperty({ required: false }) @IsOptional() @IsInt() order?: number;
}
