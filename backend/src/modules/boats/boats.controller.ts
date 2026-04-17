import { Controller, Get, Post, Patch, Delete, Param, Body, Query, UseGuards, UseInterceptors, UploadedFile, Res } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery, ApiConsumes } from '@nestjs/swagger';
import { diskStorage } from 'multer';
import { extname, join } from 'path';
import { Response } from 'express';
import { BoatsService } from './boats.service';
import { CreateBoatDto } from './dto/create-boat.dto';
import { UpdateBoatDto } from './dto/update-boat.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('boats')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('boats')
export class BoatsController {
  constructor(private boatsService: BoatsService) {}

  @Post()
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Cadastrar embarcação (Admin)' })
  create(@Body() dto: CreateBoatDto) {
    return this.boatsService.create(dto);
  }

  @Get()
  @ApiOperation({ summary: 'Listar embarcações' })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'status', required: false })
  findAll(@Query('page') page?: number, @Query('status') status?: string) {
    return this.boatsService.findAll(page, undefined, status);
  }

  @Get('my-boats')
  @ApiOperation({ summary: 'Minhas embarcações (cotas)' })
  getMyBoats(@CurrentUser('id') userId: string) {
    return this.boatsService.getUserBoats(userId);
  }

  @Get('available')
  @ApiOperation({ summary: 'Embarcações disponíveis para período' })
  @ApiQuery({ name: 'startDate', required: true })
  @ApiQuery({ name: 'endDate', required: true })
  getAvailable(@Query('startDate') startDate: string, @Query('endDate') endDate: string) {
    return this.boatsService.getAvailableForDate(new Date(startDate), new Date(endDate));
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detalhes da embarcação' })
  findById(@Param('id') id: string) {
    return this.boatsService.findById(id);
  }

  @Patch(':id')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Atualizar embarcação (Admin)' })
  update(@Param('id') id: string, @Body() dto: UpdateBoatDto) {
    return this.boatsService.update(id, dto);
  }

  @Delete(':id')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Remover embarcação (Admin)' })
  remove(@Param('id') id: string) {
    return this.boatsService.softDelete(id);
  }

  // ─── Document Upload ────────────────────────────────────

  @Post(':id/upload-document')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Upload documento da embarcação' })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', {
    storage: diskStorage({
      destination: join(__dirname, '..', '..', '..', '..', 'uploads', 'boats', 'documents'),
      filename: (_req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
        const ext = extname(file.originalname).toLowerCase() || '.pdf';
        cb(null, `${uniqueSuffix}${ext}`);
      },
    }),
    limits: { fileSize: 10 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
      if (/^(image\/(jpeg|png|gif|webp)|application\/pdf)$/.test(file.mimetype)) {
        cb(null, true);
      } else {
        cb(new Error('Apenas imagens e PDF são permitidos'), false);
      }
    },
  }))
  async uploadDocument(@Param('id') id: string, @UploadedFile() file: Express.Multer.File) {
    const host = process.env.API_URL || 'http://173.212.227.106:3000';
    const url = `${host}/uploads/boats/documents/${file.filename}`;
    return this.boatsService.updateDocumentUrl(id, url);
  }

  @Post(':id/upload-insurance')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Upload seguro da embarcação' })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', {
    storage: diskStorage({
      destination: join(__dirname, '..', '..', '..', '..', 'uploads', 'boats', 'insurance'),
      filename: (_req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
        const ext = extname(file.originalname).toLowerCase() || '.pdf';
        cb(null, `${uniqueSuffix}${ext}`);
      },
    }),
    limits: { fileSize: 10 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
      if (/^(image\/(jpeg|png|gif|webp)|application\/pdf)$/.test(file.mimetype)) {
        cb(null, true);
      } else {
        cb(new Error('Apenas imagens e PDF são permitidos'), false);
      }
    },
  }))
  async uploadInsurance(@Param('id') id: string, @UploadedFile() file: Express.Multer.File) {
    const host = process.env.API_URL || 'http://173.212.227.106:3000';
    const url = `${host}/uploads/boats/insurance/${file.filename}`;
    return this.boatsService.updateInsuranceUrl(id, url);
  }

  // ─── PDF Generation ─────────────────────────────────────

  @Get(':id/pdf/document')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Gerar PDF do documento' })
  async pdfDocument(@Param('id') id: string, @Res() res: Response) {
    const buffer = await this.boatsService.generatePdf(id, 'document');
    res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': 'attachment; filename=documento.pdf' });
    res.send(buffer);
  }

  @Get(':id/pdf/insurance')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Gerar PDF do seguro' })
  async pdfInsurance(@Param('id') id: string, @Res() res: Response) {
    const buffer = await this.boatsService.generatePdf(id, 'insurance');
    res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': 'attachment; filename=seguro.pdf' });
    res.send(buffer);
  }

  @Get(':id/pdf/combined')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Gerar PDF combinado (documento + seguro)' })
  async pdfCombined(@Param('id') id: string, @Res() res: Response) {
    const buffer = await this.boatsService.generatePdf(id, 'combined');
    res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': 'attachment; filename=documento-seguro.pdf' });
    res.send(buffer);
  }
}
