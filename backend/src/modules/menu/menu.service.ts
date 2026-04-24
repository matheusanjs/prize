import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { CreateCategoryDto, UpdateCategoryDto, CreateMenuItemDto, UpdateMenuItemDto } from './dto';

@Injectable()
export class MenuService {
  constructor(private prisma: PrismaService) {}

  // ─── Categories ─────────────────────────────────────────

  async findAllCategories(includeInactive = false) {
    return this.prisma.menuCategory.findMany({
      where: includeInactive ? {} : { isActive: true },
      include: { items: { orderBy: { order: 'asc' } } },
      orderBy: { order: 'asc' },
    });
  }

  async findCategoryById(id: string) {
    const cat = await this.prisma.menuCategory.findUnique({
      where: { id },
      include: { items: { orderBy: { order: 'asc' } } },
    });
    if (!cat) throw new NotFoundException('Categoria não encontrada');
    return cat;
  }

  async createCategory(dto: CreateCategoryDto) {
    const maxOrder = await this.prisma.menuCategory.aggregate({ _max: { order: true } });
    return this.prisma.menuCategory.create({
      data: { ...dto, order: dto.order ?? (maxOrder._max.order ?? 0) + 1 },
    });
  }

  async updateCategory(id: string, dto: UpdateCategoryDto) {
    await this.findCategoryById(id);
    return this.prisma.menuCategory.update({ where: { id }, data: dto });
  }

  async deleteCategory(id: string) {
    await this.findCategoryById(id);
    return this.prisma.menuCategory.delete({ where: { id } });
  }

  // ─── Items ──────────────────────────────────────────────

  async findAllItems(categoryId?: string) {
    return this.prisma.menuItem.findMany({
      where: categoryId ? { categoryId } : {},
      include: { category: true },
      orderBy: { order: 'asc' },
    });
  }

  async findItemById(id: string) {
    const item = await this.prisma.menuItem.findUnique({
      where: { id },
      include: { category: true },
    });
    if (!item) throw new NotFoundException('Item não encontrado');
    return item;
  }

  async createItem(dto: CreateMenuItemDto) {
    const maxOrder = await this.prisma.menuItem.aggregate({
      where: { categoryId: dto.categoryId },
      _max: { order: true },
    });
    return this.prisma.menuItem.create({
      data: { ...dto, order: dto.order ?? (maxOrder._max.order ?? 0) + 1 },
      include: { category: true },
    });
  }

  async updateItem(id: string, dto: UpdateMenuItemDto) {
    await this.findItemById(id);
    return this.prisma.menuItem.update({
      where: { id },
      data: dto,
      include: { category: true },
    });
  }

  async deleteItem(id: string) {
    await this.findItemById(id);
    return this.prisma.menuItem.delete({ where: { id } });
  }

  // ─── Public menu (site) ─────────────────────────────────

  async getConvenienceItems() {
    return this.prisma.menuItem.findMany({
      where: { isConvenience: true, isAvailable: true, category: { isActive: true } },
      include: { category: { select: { id: true, name: true } } },
      orderBy: { order: 'asc' },
    });
  }

  async getPublicMenu() {
    return this.prisma.menuCategory.findMany({
      where: { isActive: true },
      include: {
        items: {
          where: { isAvailable: true },
          orderBy: { order: 'asc' },
          select: {
            id: true,
            name: true,
            description: true,
            price: true,
            image: true,
            order: true,
          },
        },
      },
      orderBy: { order: 'asc' },
    });
  }
}
