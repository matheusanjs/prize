import { Controller, Get, UseGuards, UseInterceptors } from '@nestjs/common';
import { CacheInterceptor, CacheTTL } from '@nestjs/cache-manager';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { DashboardService } from './dashboard.service';

@ApiTags('dashboard')
@Controller('dashboard')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
@ApiBearerAuth()
export class DashboardController {
  constructor(private dashboardService: DashboardService) {}

  @Get('stats')
  @UseInterceptors(CacheInterceptor)
  @CacheTTL(60000)
  @ApiOperation({ summary: 'Dashboard completo com estatísticas' })
  getStats() {
    return this.dashboardService.getFullStats();
  }
}
