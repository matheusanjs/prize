import {
  Controller, Get, Post, Patch, Delete, Param, Body, Query,
  UseGuards, Req, UploadedFiles, UseInterceptors, Res,
  BadRequestException,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { SocialService } from './social.service';
import { Response } from 'express';

@Controller('social')
export class SocialController {
  constructor(private readonly socialService: SocialService) {}

  // ═══════════════════════════════════════════════════════════════
  // TRIPS — Public
  // ═══════════════════════════════════════════════════════════════

  /** Public share page data */
  @Get('share/:token')
  getSharePage(@Param('token') token: string) {
    return this.socialService.getTripByShareToken(token);
  }

  // ═══════════════════════════════════════════════════════════════
  // TRIPS — Authenticated
  // ═══════════════════════════════════════════════════════════════

  @UseGuards(JwtAuthGuard)
  @Get('trips')
  listTrips(@CurrentUser('id') userId: string) {
    return this.socialService.listTrips(userId);
  }

  @UseGuards(JwtAuthGuard)
  @Get('trips/:id')
  getTrip(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.socialService.getTrip(id, userId);
  }

  @UseGuards(JwtAuthGuard)
  @Post('trips')
  createTrip(@CurrentUser('id') userId: string, @Body() body: any) {
    return this.socialService.createTrip(userId, body);
  }

  @UseGuards(JwtAuthGuard)
  @Post('trips/:id/join')
  joinTrip(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.socialService.joinTrip(id, userId);
  }

  @UseGuards(JwtAuthGuard)
  @Post('trips/:id/leave')
  leaveTrip(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.socialService.leaveTrip(id, userId);
  }

  @UseGuards(JwtAuthGuard)
  @Post('trips/:id/like')
  toggleLike(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.socialService.toggleLike(id, userId);
  }

  // ═══════════════════════════════════════════════════════════════
  // CHAT — Messages
  // ═══════════════════════════════════════════════════════════════

  @UseGuards(JwtAuthGuard)
  @Get('trips/:id/messages')
  getMessages(
    @Param('id') id: string,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
  ) {
    return this.socialService.getMessages(id, cursor, parseInt(limit || '50'));
  }

  @UseGuards(JwtAuthGuard)
  @Post('trips/:id/messages')
  sendMessage(
    @Param('id') tripId: string,
    @CurrentUser('id') userId: string,
    @Body() body: { content?: string; type?: string; mediaBase64?: string },
  ) {
    return this.socialService.sendMessage(tripId, userId, body);
  }

  // ═══════════════════════════════════════════════════════════════
  // ADMIN
  // ═══════════════════════════════════════════════════════════════

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @Get('admin/trips')
  adminListTrips(@Query('status') status?: string) {
    return this.socialService.adminListTrips(status);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @Get('admin/trips/:id')
  adminGetTrip(@Param('id') id: string) {
    return this.socialService.adminGetTrip(id);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @Patch('admin/trips/:id/approve')
  approveTrip(@Param('id') id: string) {
    return this.socialService.updateTripStatus(id, 'APPROVED');
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @Patch('admin/trips/:id/reject')
  rejectTrip(@Param('id') id: string) {
    return this.socialService.updateTripStatus(id, 'REJECTED');
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @Patch('admin/trips/:id/highlight')
  toggleHighlight(@Param('id') id: string) {
    return this.socialService.toggleHighlight(id);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @Patch('admin/trips/:id/official')
  toggleOfficial(@Param('id') id: string) {
    return this.socialService.toggleOfficial(id);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @Patch('admin/trips/:id')
  adminUpdateTrip(@Param('id') id: string, @Body() body: any) {
    return this.socialService.adminUpdateTrip(id, body);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @Delete('admin/trips/:id')
  deleteTrip(@Param('id') id: string) {
    return this.socialService.deleteTrip(id);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @Delete('admin/messages/:id')
  deleteMessage(@Param('id') id: string) {
    return this.socialService.deleteMessage(id);
  }
}
