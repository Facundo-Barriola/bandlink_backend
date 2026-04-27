import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { Prisma } from '../generated/prisma/client';
import { SendFriendRequestDTO } from './dto/send-friend-request.dto';
import { FollowDTO } from './dto/follow.dto';

@Injectable()
export class SocialService {
  constructor(private readonly prisma: PrismaService) {}


  async sendFriendRequest(userId: string, dto: SendFriendRequestDTO) {
    if (userId === dto.to_user_id) {
      throw new BadRequestException(
        'No puedes enviarte una solicitud de amistad a ti mismo',
      );
    }

    try {
      const targetUser = await this.prisma.users.findUnique({
        where: { user_id: dto.to_user_id },
        select: { user_id: true },
      });

      if (!targetUser) {
        throw new NotFoundException('Usuario no encontrado');
      }

      const existingRequest = await this.prisma.friend_requests.findFirst({
        where: {
          OR: [
            { from_user_id: userId, to_user_id: dto.to_user_id },
            { from_user_id: dto.to_user_id, to_user_id: userId },
          ],
          status: 'Pendiente',
        },
        select: { request_id: true },
      });

      if (existingRequest) {
        throw new ConflictException('Ya existe una solicitud de amistad pendiente entre estos usuarios');
      }

      const [id1, id2] = [userId, dto.to_user_id].sort();
      const alreadyFriends = await this.prisma.friendships.findUnique({
        where: { user_id1_user_id2: { user_id1: id1, user_id2: id2 } },
        select: { friendship_id: true },
      });

      if (alreadyFriends) {
        throw new ConflictException('Ya son amigos');
      }

      return await this.prisma.friend_requests.create({
        data: {
          from_user_id: userId,
          to_user_id: dto.to_user_id,
          message: dto.message ?? null,
          status: 'Pendiente',
        },
        select: {
          request_id: true,
          to_user_id: true,
          message: true,
          status: true,
          created_at: true,
        },
      });
    } catch (error) {
      if (
        error instanceof BadRequestException ||
        error instanceof ConflictException ||
        error instanceof NotFoundException
      ) {
        throw error;
      }
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException('Ya existe una solicitud de amistad pendiente');
      }
      console.error('ERROR SEND FRIEND REQUEST =>', error);
      throw new InternalServerErrorException('Error al enviar la solicitud de amistad');
    }
  }

  async getReceivedRequests(userId: string) {
    return this.prisma.friend_requests.findMany({
      where: { to_user_id: userId, status: 'Pendiente' },
      select: {
        request_id: true,
        message: true,
        status: true,
        created_at: true,
        users_friend_requests_from_user_idTousers: {
          select: { user_id: true, username: true, display_name: true },
        },
      },
      orderBy: { created_at: 'desc' },
    });
  }

  async getSentRequests(userId: string) {
    return this.prisma.friend_requests.findMany({
      where: { from_user_id: userId, status: 'Pendiente' },
      select: {
        request_id: true,
        message: true,
        status: true,
        created_at: true,
        users_friend_requests_to_user_idTousers: {
          select: { user_id: true, username: true, display_name: true },
        },
      },
      orderBy: { created_at: 'desc' },
    });
  }

  async acceptRequest(userId: string, requestId: string) {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const request = await this.getRequestOrThrow(tx, requestId);

        if (request.to_user_id !== userId) {
          throw new ForbiddenException('No puedes responder esta solicitud');
        }

        if (request.status !== 'Pendiente') {
          throw new BadRequestException('La solicitud ya fue respondida');
        }

        await tx.friend_requests.update({
          where: { request_id: requestId },
          data: { status: 'Aceptada', responded_at: new Date() },
        });

        const [id1, id2] = [request.from_user_id, userId].sort();
        await tx.friendships.create({
          data: { user_id1: id1, user_id2: id2 },
        });

        return { message: 'Solicitud de amistad aceptada' };
      });
    } catch (error) {
      if (
        error instanceof ForbiddenException ||
        error instanceof NotFoundException ||
        error instanceof BadRequestException ||
        error instanceof ConflictException
      ) {
        throw error;
      }
      console.error('ERROR ACCEPT FRIEND REQUEST =>', error);
      throw new InternalServerErrorException('Error al aceptar la solicitud');
    }
  }

  async rejectRequest(userId: string, requestId: string) {
    const request = await this.getRequestOrThrow(this.prisma, requestId);

    if (request.to_user_id !== userId) {
      throw new ForbiddenException('No puedes responder esta solicitud');
    }

    if (request.status !== 'Pendiente') {
      throw new BadRequestException('La solicitud ya fue respondida');
    }

    await this.prisma.friend_requests.update({
      where: { request_id: requestId },
      data: { status: 'Rechazada', responded_at: new Date() },
    });

    return { message: 'Solicitud de amistad rechazada' };
  }

  async cancelRequest(userId: string, requestId: string) {
    const request = await this.getRequestOrThrow(this.prisma, requestId);

    if (request.from_user_id !== userId) {
      throw new ForbiddenException('No puedes cancelar esta solicitud');
    }

    if (request.status !== 'Pendiente') {
      throw new BadRequestException('La solicitud ya fue respondida y no puede cancelarse');
    }

    await this.prisma.friend_requests.delete({ where: { request_id: requestId } });

    return { message: 'Solicitud de amistad cancelada' };
  }

  async getMyFriends(userId: string) {
    const friendships = await this.prisma.friendships.findMany({
      where: {
        OR: [{ user_id1: userId }, { user_id2: userId }],
      },
      select: {
        friendship_id: true,
        created_at: true,
        users_friendships_user_id1Tousers: {
          select: { user_id: true, username: true, display_name: true },
        },
        users_friendships_user_id2Tousers: {
          select: { user_id: true, username: true, display_name: true },
        },
      },
    });

    return friendships.map((f) => {
      const friend =
        f.users_friendships_user_id1Tousers.user_id === userId
          ? f.users_friendships_user_id2Tousers
          : f.users_friendships_user_id1Tousers;
      return { friendship_id: f.friendship_id, friend, created_at: f.created_at };
    });
  }

  async removeFriendship(userId: string, friendshipId: string) {
    const friendship = await this.prisma.friendships.findUnique({
      where: { friendship_id: friendshipId },
      select: { friendship_id: true, user_id1: true, user_id2: true },
    });

    if (!friendship) {
      throw new NotFoundException('Amistad no encontrada');
    }

    if (friendship.user_id1 !== userId && friendship.user_id2 !== userId) {
      throw new ForbiddenException('No puedes eliminar esta amistad');
    }

    await this.prisma.friendships.delete({ where: { friendship_id: friendshipId } });

    return { message: 'Amistad eliminada correctamente' };
  }

  async follow(userId: string, dto: FollowDTO) {
    if (dto.target_type === 'user' && dto.target_id === userId) {
      throw new BadRequestException('No puedes seguirte a ti mismo');
    }

    try {
      await this.prisma.follows.create({
        data: {
          follower_user_id: userId,
          target_type: dto.target_type,
          target_id: dto.target_id,
        },
      });
      return { message: 'Ahora sigues a este usuario/entidad' };
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException('Ya sigues a este usuario/entidad');
      }
      throw new InternalServerErrorException('Error al seguir al usuario/entidad');
    }
  }

  async unfollow(userId: string, targetType: string, targetId: string) {
    const existing = await this.prisma.follows.findUnique({
      where: {
        follower_user_id_target_type_target_id: {
          follower_user_id: userId,
          target_type: targetType,
          target_id: targetId,
        },
      },
      select: { follower_user_id: true },
    });

    if (!existing) {
      throw new NotFoundException('No sigues a este usuario/entidad');
    }

    await this.prisma.follows.delete({
      where: {
        follower_user_id_target_type_target_id: {
          follower_user_id: userId,
          target_type: targetType,
          target_id: targetId,
        },
      },
    });

    return { message: 'Dejaste de seguir a este usuario/entidad' };
  }

  async getMyFollows(userId: string) {
    return this.prisma.follows.findMany({
      where: { follower_user_id: userId },
      select: {
        target_type: true,
        target_id: true,
        created_at: true,
      },
      orderBy: { created_at: 'desc' },
    });
  }

  private async getRequestOrThrow(
    client: any,
    requestId: string,
  ) {
    const req = await client.friend_requests.findUnique({
      where: { request_id: requestId },
      select: {
        request_id: true,
        from_user_id: true,
        to_user_id: true,
        status: true,
      },
    });

    if (!req) {
      throw new NotFoundException('Solicitud de amistad no encontrada');
    }

    return req;
  }
}