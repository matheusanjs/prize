import { IsString, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ChangePasswordDto {
  @ApiProperty({ description: 'Senha atual do usuário' })
  @IsString()
  currentPassword: string;

  @ApiProperty({ description: 'Nova senha (mínimo 6 caracteres)' })
  @IsString()
  @MinLength(6)
  newPassword: string;
}
