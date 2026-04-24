import { Controller, Get, Patch, Delete, Param, Body, Query, UseGuards, Res, NotFoundException } from '@nestjs/common';
import type { Response } from 'express';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { UsersService } from './users.service';
import { UpdateUserDto } from './dto/update-user.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { PrismaService } from '../../database/prisma.service';

@ApiTags('users')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('users')
export class UsersController {
  constructor(private usersService: UsersService, private prisma: PrismaService) {}

  @Get()
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Listar todos os usuários (Admin)' })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  @ApiQuery({ name: 'role', required: false, enum: ['ADMIN', 'OPERATOR', 'CLIENT', 'WAITER'] })
  @ApiQuery({ name: 'search', required: false })
  findAll(
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('role') role?: string,
    @Query('search') search?: string,
  ) {
    return this.usersService.findAll(page, limit, role, search);
  }

  @Get('profile')
  @ApiOperation({ summary: 'Ver perfil do usuário logado' })
  getProfile(@CurrentUser('id') userId: string) {
    return this.usersService.getProfile(userId);
  }

  @Patch('profile')
  @ApiOperation({ summary: 'Atualizar dados do próprio perfil' })
  updateProfile(
    @CurrentUser('id') userId: string,
    @Body() dto: UpdateUserDto,
  ) {
    const { name, phone, avatar } = dto;
    return this.usersService.updateProfile(userId, { name, phone, avatar });
  }

  @Delete('profile')
  @ApiOperation({ summary: 'Excluir própria conta (soft delete)' })
  deleteMyAccount(@CurrentUser('id') userId: string) {
    return this.usersService.softDelete(userId);
  }

  @Get(':id/avatar')
  @ApiOperation({ summary: 'Avatar do usuário (data URL ou imagem)' })
  async getAvatar(@Param('id') id: string, @Res() res: Response) {
    const u = await this.prisma.user.findUnique({ where: { id }, select: { avatar: true } });
    if (!u || !u.avatar) throw new NotFoundException();
    res.setHeader('Cache-Control', 'private, max-age=86400'); // 1 day
    // If it's a data URL, decode and send as image; otherwise return as text URL
    if (u.avatar.startsWith('data:')) {
      const m = u.avatar.match(/^data:([^;]+);base64,(.*)$/);
      if (m) {
        res.setHeader('Content-Type', m[1]);
        return res.send(Buffer.from(m[2], 'base64'));
      }
    }
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    return res.send(u.avatar);
  }

  @Get(':id')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Buscar usuário por ID (Admin)' })
  findById(@Param('id') id: string) {
    return this.usersService.findById(id);
  }

  @Patch(':id')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Atualizar usuário (Admin)' })
  update(@Param('id') id: string, @Body() dto: UpdateUserDto) {
    return this.usersService.update(id, dto);
  }

  @Delete(':id')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Desativar usuário — soft delete (Admin)' })
  remove(@Param('id') id: string) {
    return this.usersService.softDelete(id);
  }
}
