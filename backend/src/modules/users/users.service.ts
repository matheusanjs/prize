import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { UpdateUserDto } from './dto/update-user.dto';

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  async findAll(p = 1, l = 20, role?: string, search?: string) {
    const page = Number(p) || 1;
    const limit = Number(l) || 20;
    const where: any = { deletedAt: null };
    if (role) where.role = role;
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [users, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true, name: true, email: true, phone: true,
          role: true, isActive: true, lastLoginAt: true, createdAt: true,
          avatar: true,
          _count: { select: { shares: { where: { isActive: true, deletedAt: null } } } },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.user.count({ where }),
    ]);

    return { data: users.map(u => ({ ...u, shares: (u as any)._count?.shares ?? 0, _count: undefined })), total, page, pages: Math.ceil(total / limit) };
  }

  async findById(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true, name: true, email: true, phone: true, cpfCnpj: true,
        role: true, avatar: true, isActive: true, emailVerified: true,
        lastLoginAt: true, createdAt: true,
        shares: { where: { isActive: true }, include: { boat: { select: { id: true, name: true, model: true } } } },
      },
    });

    if (!user) throw new NotFoundException('Usuário não encontrado');
    return user;
  }

  async update(id: string, dto: UpdateUserDto) {
    await this.findById(id);
    try {
      return await this.prisma.user.update({
        where: { id },
        data: dto as any,
        select: { id: true, name: true, email: true, phone: true, role: true, isActive: true },
      });
    } catch (error: any) {
      if (error.code === 'P2002') {
        const field = error.meta?.target?.[0] || 'campo';
        const labels: Record<string, string> = { phone: 'telefone', email: 'e-mail' };
        throw new ConflictException(`Já existe um usuário com este ${labels[field] || field}`);
      }
      throw error;
    }
  }

  async softDelete(id: string) {
    await this.findById(id);
    return this.prisma.user.update({
      where: { id },
      data: { deletedAt: new Date(), isActive: false },
    });
  }

  async getProfile(userId: string) {
    return this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true, name: true, email: true, phone: true, cpfCnpj: true,
        role: true, avatar: true, createdAt: true,
        shares: {
          where: { isActive: true },
          include: { boat: { select: { id: true, name: true, model: true, imageUrl: true } } },
        },
        _count: { select: { reservations: true, charges: true } },
      },
    });
  }

  async updateProfile(id: string, dto: { name?: string; phone?: string; avatar?: string }) {
    try {
      return await this.prisma.user.update({
        where: { id },
        data: dto,
        select: { id: true, name: true, email: true, phone: true, role: true, avatar: true },
      });
    } catch (error: any) {
      if (error.code === 'P2002') {
        const field = error.meta?.target?.[0] || 'campo';
        const labels: Record<string, string> = { phone: 'telefone', email: 'e-mail' };
        throw new ConflictException(`Já existe um usuário com este ${labels[field] || field}`);
      }
      throw error;
    }
  }
}
