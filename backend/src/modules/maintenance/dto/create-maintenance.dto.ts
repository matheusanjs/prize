import { IsString, IsOptional, IsNumber, IsEnum, IsDateString, IsBoolean } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateMaintenanceDto {
  @ApiProperty()
  @IsString()
  boatId: string;

  @ApiProperty({ example: 'Troca de óleo' })
  @IsString()
  title: string;

  @ApiProperty({ example: 'Motor necessita troca de óleo após 100h de uso' })
  @IsString()
  description: string;

  @ApiPropertyOptional({ enum: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] })
  @IsOptional()
  @IsEnum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'])
  priority?: string;

  @ApiPropertyOptional({ example: 800.00 })
  @IsOptional()
  @IsNumber()
  estimatedCost?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  scheduledAt?: string;

  @ApiPropertyOptional({ description: 'Whether to block the boat from reservations' })
  @IsOptional()
  @IsBoolean()
  blockBoat?: boolean;
}
