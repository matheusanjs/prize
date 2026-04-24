import {
  Controller, Get, Post, Put, Delete,
  Body, Param, Query, UseGuards,
  UseInterceptors, UploadedFile,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiConsumes } from '@nestjs/swagger';
import { diskStorage } from 'multer';
import { extname, join } from 'path';
import { MenuService } from './menu.service';
import { CreateCategoryDto, UpdateCategoryDto, CreateMenuItemDto, UpdateMenuItemDto } from './dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';

@ApiTags('menu')
@Controller('menu')
export class MenuController {
  constructor(private menuService: MenuService) {}

  // ─── Public ─────────────────────────────────────────────

  @Get('public')
  @ApiOperation({ summary: 'Cardápio público (site)' })
  getPublicMenu() {
    return this.menuService.getPublicMenu();
  }

  @Get('convenience')
  @ApiOperation({ summary: 'Itens de conveniência (APP COTISTA)' })
  getConvenienceItems() {
    return this.menuService.getConvenienceItems();
  }

  // ─── Categories (admin) ─────────────────────────────────

  @Get('categories')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Listar categorias' })
  findAllCategories(@Query('includeInactive') includeInactive?: string) {
    return this.menuService.findAllCategories(includeInactive === 'true');
  }

  @Get('categories/:id')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Buscar categoria por ID' })
  findCategory(@Param('id') id: string) {
    return this.menuService.findCategoryById(id);
  }

  @Post('categories')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Criar categoria' })
  createCategory(@Body() dto: CreateCategoryDto) {
    return this.menuService.createCategory(dto);
  }

  @Put('categories/:id')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Atualizar categoria' })
  updateCategory(@Param('id') id: string, @Body() dto: UpdateCategoryDto) {
    return this.menuService.updateCategory(id, dto);
  }

  @Delete('categories/:id')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Excluir categoria' })
  deleteCategory(@Param('id') id: string) {
    return this.menuService.deleteCategory(id);
  }

  // ─── Items (admin) ─────────────────────────────────────

  @Get('items')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Listar itens do cardápio' })
  findAllItems(@Query('categoryId') categoryId?: string) {
    return this.menuService.findAllItems(categoryId);
  }

  @Get('items/:id')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Buscar item por ID' })
  findItem(@Param('id') id: string) {
    return this.menuService.findItemById(id);
  }

  @Post('items')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Criar item do cardápio' })
  createItem(@Body() dto: CreateMenuItemDto) {
    return this.menuService.createItem(dto);
  }

  @Put('items/:id')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Atualizar item do cardápio' })
  updateItem(@Param('id') id: string, @Body() dto: UpdateMenuItemDto) {
    return this.menuService.updateItem(id, dto);
  }

  @Delete('items/:id')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Excluir item do cardápio' })
  deleteItem(@Param('id') id: string) {
    return this.menuService.deleteItem(id);
  }

  // ─── Upload ─────────────────────────────────────────────

  @Post('upload')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Upload de imagem do cardápio' })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', {
    storage: diskStorage({
      destination: join(__dirname, '..', '..', '..', '..', 'uploads', 'menu'),
      filename: (_req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
        const ext = extname(file.originalname).toLowerCase() || '.jpg';
        cb(null, `${uniqueSuffix}${ext}`);
      },
    }),
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
      if (/^image\/(jpeg|png|gif|webp)$/.test(file.mimetype)) {
        cb(null, true);
      } else {
        cb(new Error('Apenas imagens são permitidas (jpg, png, gif, webp)'), false);
      }
    },
  }))
  uploadImage(@UploadedFile() file: Express.Multer.File) {
    const host = process.env.API_URL || 'http://173.212.227.106:3000';
    return { url: `${host}/uploads/menu/${file.filename}` };
  }
}
