import {
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { JwtAuthGuard } from 'src/auth/jwt-auth.guard';
import { NotificationsService } from './notifications.service';

@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get()
  @UseGuards(JwtAuthGuard)
  getMyNotifications(@Req() req: Request & { user: any }) {
    return this.notificationsService.getMyNotifications(req.user.userId);
  }

  @Get('unread-count')
  @UseGuards(JwtAuthGuard)
  getUnreadCount(@Req() req: Request & { user: any }) {
    return this.notificationsService.getUnreadCount(req.user.userId);
  }

  @Patch('read-all')
  @UseGuards(JwtAuthGuard)
  markAllAsRead(@Req() req: Request & { user: any }) {
    return this.notificationsService.markAllAsRead(req.user.userId);
  }

  @Patch(':notificationId/read')
  @UseGuards(JwtAuthGuard)
  markAsRead(
    @Req() req: Request & { user: any },
    @Param('notificationId') notificationId: string,
  ) {
    return this.notificationsService.markAsRead(req.user.userId, notificationId);
  }
}