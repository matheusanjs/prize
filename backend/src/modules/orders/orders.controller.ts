import {
  Controller, Get, Post, Put, Delete,
  Body, Param, Query, UseGuards, Req,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { OrdersService } from './orders.service';
import { CreateOrderDto, UpdateOrderDto } from './dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('orders')
@Controller('orders')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
export class OrdersController {
  constructor(private ordersService: OrdersService) {}

  @Get()
  @ApiOperation({ summary: 'Listar pedidos' })
  findAll(
    @Query('status') status?: string,
    @Query('date') date?: string,
    @Query('restaurantTableId') restaurantTableId?: string,
  ) {
    return this.ordersService.findAll(status, date, restaurantTableId);
  }

  @Get('stats')
  @ApiOperation({ summary: 'Estatísticas dos pedidos de hoje' })
  getStats() {
    return this.ordersService.getStats();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Buscar pedido por ID' })
  findOne(@Param('id') id: string) {
    return this.ordersService.findOne(id);
  }

  @Post()
  @ApiOperation({ summary: 'Criar pedido' })
  create(@Body() dto: CreateOrderDto) {
    return this.ordersService.create(dto);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Atualizar pedido' })
  update(@Param('id') id: string, @Body() dto: UpdateOrderDto) {
    return this.ordersService.update(id, dto);
  }

  @Put(':id/advance')
  @ApiOperation({ summary: 'Avançar status do pedido' })
  advance(@Param('id') id: string) {
    return this.ordersService.advanceStatus(id);
  }

  @Put(':id/cancel')
  @ApiOperation({ summary: 'Cancelar pedido' })
  cancel(@Param('id') id: string) {
    return this.ordersService.cancel(id);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Excluir pedido' })
  remove(@Param('id') id: string) {
    return this.ordersService.remove(id);
  }
}

@ApiTags('orders')
@Controller('orders/app-cotista')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
export class ConvenienceOrderController {
  constructor(private ordersService: OrdersService) {}

  @Post()
  @ApiOperation({ summary: 'Criar pedido de conveniência (APP COTISTA)' })
  create(
    @CurrentUser('id') userId: string,
    @Body() dto: { items: { menuItemId: string; quantity: number; notes?: string }[]; notes?: string; paymentMethod: 'PIX' | 'PICKUP' },
  ) {
    return this.ordersService.createConvenienceOrder(userId, dto);
  }
}
