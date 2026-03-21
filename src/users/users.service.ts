import {
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { UpdateMeDTO } from './dto/update-me.dto';
import { Prisma } from '../generated/prisma/client';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async getMe(userId: string) {
    const user = await this.prisma.users.findUnique({
      where: {
        user_id: userId,
      },
      select: {
        user_id: true,
        email: true,
        username: true,
        display_name: true,
        bio: true,
        phone: true,
        birthdate: true,
        place_id: true,
        profile_visibility: true,
        is_active: true,
        email_verified: true,
        created_at: true,
        updated_at: true,
        places: {
          select: {
            place_id: true,
            name: true,
            address_line1: true,
            city: true,
            region: true,
            country: true,
            lat: true,
            lng: true,
          },
        },
        user_roles: {
          select: {
            role: true,
          },
        },
      },
    });

    if (!user) {
      throw new NotFoundException('Usuario no encontrado');
    }

    return user;
  }

  async updateMe(userId: string, dto: UpdateMeDTO) {
    try {
      const existingUser = await this.prisma.users.findUnique({
        where: {
          user_id: userId,
        },
        select: {
          user_id: true,
        },
      });

      if (!existingUser) {
        throw new NotFoundException('Usuario no encontrado');
      }

      const updatedUser = await this.prisma.users.update({
        where: {
          user_id: userId,
        },
        data: {
          ...(dto.display_name !== undefined && { display_name: dto.display_name }),
          ...(dto.bio !== undefined && { bio: dto.bio }),
          ...(dto.phone !== undefined && { phone: dto.phone }),
          ...(dto.birthdate !== undefined && { birthdate: new Date(dto.birthdate) }),
          ...(dto.place_id !== undefined && { place_id: dto.place_id }),
          ...(dto.profile_visibility !== undefined && {
            profile_visibility: dto.profile_visibility,
          }),
          updated_at: new Date(),
        },
        select: {
          user_id: true,
          email: true,
          username: true,
          display_name: true,
          bio: true,
          phone: true,
          birthdate: true,
          place_id: true,
          profile_visibility: true,
          is_active: true,
          email_verified: true,
          updated_at: true,
          places: {
            select: {
              place_id: true,
              name: true,
              address_line1: true,
              city: true,
              region: true,
              country: true,
              lat: true,
              lng: true,
            },
          },
          user_roles: {
            select: {
              role: true,
            },
          },
        },
      });

      return updatedUser;
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }

      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2003'
      ) {
        throw new InternalServerErrorException('La ubicación seleccionada no es válida');
      }

      console.error('ERROR UPDATE ME =>', error);
      throw new InternalServerErrorException(
        'Error al actualizar la información del usuario',
      );
    }
  }
}