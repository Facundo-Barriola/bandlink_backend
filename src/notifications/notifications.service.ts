import {
  Injectable,
  InternalServerErrorException,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';

@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  async createNotification(
    userId: string,
    type: string,
    payload: Record<string, any>,
  ): Promise<void> {
    try {
      await this.prisma.notifications.create({
        data: {
          user_id: userId,
          notification_type: type,
          payload,
        },
      });
    } catch (error) {
      console.error('ERROR CREATE NOTIFICATION =>', error);
    }
  }

  async getMyNotifications(userId: string) {
    return this.prisma.notifications.findMany({
      where: {
        user_id: userId,
        created_at: {
          gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
        },
      },
      select: {
        notification_id: true,
        notification_type: true,
        payload: true,
        read_at: true,
        created_at: true,
      },
      orderBy: { created_at: 'desc' },
      take: 50,
    });
  }

  async markAsRead(userId: string, notificationId: string) {
    const notif = await this.prisma.notifications.findUnique({
      where: { notification_id: notificationId },
      select: { notification_id: true, user_id: true, read_at: true },
    });

    if (!notif) {
      throw new NotFoundException('Notificación no encontrada');
    }

    if (notif.user_id !== userId) {
      throw new ForbiddenException('No tienes acceso a esta notificación');
    }

    if (notif.read_at) {
      return { message: 'La notificación ya estaba marcada como leída' };
    }

    await this.prisma.notifications.update({
      where: { notification_id: notificationId },
      data: { read_at: new Date() },
    });

    return { message: 'Notificación marcada como leída' };
  }

  async markAllAsRead(userId: string) {
    const result = await this.prisma.notifications.updateMany({
      where: { user_id: userId, read_at: null },
      data: { read_at: new Date() },
    });

    return { message: `${result.count} notificaciones marcadas como leídas` };
  }

  async getUnreadCount(userId: string) {
    const count = await this.prisma.notifications.count({
      where: { user_id: userId, read_at: null },
    });

    return { unread_count: count };
  }
}