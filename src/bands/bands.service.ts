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
import { CreateBandDTO } from './dto/create-band.dto';
import { UpdateBandDTO } from './dto/update-band.dto';
import { CreateOpeningDTO } from './dto/create-opening.dto';
import { UpdateOpeningDTO } from './dto/update-opening.dto';

@Injectable()
export class BandsService {
  constructor(private readonly prisma: PrismaService) {}

  async createBand(userId: string, dto: CreateBandDTO) {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const band = await tx.bands.create({
          data: {
            owner_user_id: userId,
            name: dto.name,
            description: dto.description ?? null,
            place_id: dto.place_id ?? null,
          },
          select: {
            band_id: true,
            owner_user_id: true,
            name: true,
            description: true,
            place_id: true,
            is_active: true,
            created_at: true,
          },
        });

        await tx.band_members.create({
          data: {
            band_id: band.band_id,
            user_id: userId,
            role: 'owner',
            status: 'Activo',
            joined_at: new Date(),
          },
        });

        return band;
      });
    } catch (error) {
      if (
        error instanceof BadRequestException ||
        error instanceof ConflictException
      ) {
        throw error;
      }
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException('Ya existe una banda con ese nombre');
      }
      console.error('ERROR CREATE BAND =>', error);
      throw new InternalServerErrorException('Error al crear la banda');
    }
  }

  async getMyBands(userId: string) {
    try {
      return await this.prisma.bands.findMany({
        where: {
          OR: [
            { owner_user_id: userId },
            {
              band_members: {
                user_id: userId,
                left_at: null,
              },
            },
          ],
        },
        select: {
          band_id: true,
          owner_user_id: true,
          name: true,
          description: true,
          is_active: true,
          created_at: true,
          places: {
            select: {
              place_id: true,
              city: true,
              country: true,
            },
          },
        },
      });
    } catch (error) {
      console.error('ERROR GET MY BANDS =>', error);
      throw new InternalServerErrorException('Error al obtener las bandas');
    }
  }

  async getBand(bandId: string) {
    const band = await this.prisma.bands.findUnique({
      where: { band_id: bandId },
      select: {
        band_id: true,
        owner_user_id: true,
        name: true,
        description: true,
        is_active: true,
        created_at: true,
        updated_at: true,
        places: {
          select: {
            place_id: true,
            city: true,
            region: true,
            country: true,
          },
        },
        band_genres: {
          select: {
            band_genre_id: true,
            genres: {
              select: {
                genre_id: true,
                name: true,
              },
            },
          },
        },
      },
    });

    if (!band) {
      throw new NotFoundException('Banda no encontrada');
    }

    const members = await this.prisma.band_members.findMany({
      where: { band_id: bandId, left_at: null },
      select: {
        band_member_id: true,
        role: true,
        status: true,
        joined_at: true,
        description: true,
        users: {
          select: {
            user_id: true,
            username: true,
            display_name: true,
          },
        },
      },
    });

    return { ...band, members };
  }

  async updateBand(userId: string, bandId: string, dto: UpdateBandDTO) {
    try {
      await this.ensureOwner(userId, bandId);

      return await this.prisma.bands.update({
        where: { band_id: bandId },
        data: {
          ...(dto.name !== undefined && { name: dto.name }),
          ...(dto.description !== undefined && { description: dto.description }),
          ...(dto.place_id !== undefined && { place_id: dto.place_id }),
          ...(dto.is_active !== undefined && { is_active: dto.is_active }),
          updated_at: new Date(),
        },
        select: {
          band_id: true,
          owner_user_id: true,
          name: true,
          description: true,
          place_id: true,
          is_active: true,
          updated_at: true,
        },
      });
    } catch (error) {
      if (
        error instanceof ForbiddenException ||
        error instanceof NotFoundException ||
        error instanceof BadRequestException
      ) {
        throw error;
      }
      console.error('ERROR UPDATE BAND =>', error);
      throw new InternalServerErrorException('Error al actualizar la banda');
    }
  }

  async deleteBand(userId: string, bandId: string) {
    try {
      await this.ensureOwner(userId, bandId);

      await this.prisma.bands.delete({ where: { band_id: bandId } });

      return { message: 'Banda eliminada correctamente' };
    } catch (error) {
      if (
        error instanceof ForbiddenException ||
        error instanceof NotFoundException
      ) {
        throw error;
      }
      console.error('ERROR DELETE BAND =>', error);
      throw new InternalServerErrorException('Error al eliminar la banda');
    }
  }

  async getMembers(bandId: string) {
    await this.findBandOrFail(bandId);

    return this.prisma.band_members.findMany({
      where: { band_id: bandId, left_at: null },
      select: {
        band_member_id: true,
        role: true,
        status: true,
        joined_at: true,
        description: true,
        users: {
          select: {
            user_id: true,
            username: true,
            display_name: true,
          },
        },
      },
    });
  }

  async leaveBand(userId: string, bandId: string) {
    const member = await this.prisma.band_members.findFirst({
      where: { band_id: bandId, user_id: userId, left_at: null },
    });

    if (!member) {
      throw new NotFoundException('No eres miembro activo de esta banda');
    }

    if (member.role === 'owner') {
      throw new BadRequestException(
        'El creador no puede abandonar la banda. Elimínala si deseas salir.',
      );
    }

    await this.prisma.band_members.update({
      where: { band_member_id: member.band_member_id },
      data: { left_at: new Date(), status: 'Inactivo' },
    });

    return { message: 'Saliste de la banda correctamente' };
  }

  async kickMember(userId: string, bandId: string, memberId: string) {
    try {
      await this.ensureOwner(userId, bandId);

      const member = await this.prisma.band_members.findFirst({
        where: {
          band_member_id: memberId,
          band_id: bandId,
          left_at: null,
        },
      });

      if (!member) {
        throw new NotFoundException('Miembro no encontrado en esta banda');
      }

      if (member.user_id === userId) {
        throw new BadRequestException('No puedes expulsarte a ti mismo');
      }

      await this.prisma.band_members.update({
        where: { band_member_id: memberId },
        data: { left_at: new Date(), status: 'Inactivo' },
      });

      return { message: 'Miembro expulsado correctamente' };
    } catch (error) {
      if (
        error instanceof ForbiddenException ||
        error instanceof NotFoundException ||
        error instanceof BadRequestException
      ) {
        throw error;
      }
      console.error('ERROR KICK MEMBER =>', error);
      throw new InternalServerErrorException('Error al expulsar al miembro');
    }
  }

  async createOpening(userId: string, bandId: string, dto: CreateOpeningDTO) {
    try {
      await this.ensureOwner(userId, bandId);

      const instrumentExists = await this.prisma.instrument.findUnique({
        where: { instrument_id: dto.instrument_id },
        select: { instrument_id: true },
      });

      if (!instrumentExists) {
        throw new BadRequestException('Instrumento no encontrado');
      }

      return await this.prisma.band_openings.create({
        data: {
          band_id: bandId,
          instrument_id: dto.instrument_id,
          description: dto.description ?? null,
          place_id: dto.place_id ?? null,
          status: 'Abierta',
        },
        select: {
          opening_id: true,
          band_id: true,
          instrument_id: true,
          description: true,
          place_id: true,
          status: true,
          created_at: true,
          instrument: {
            select: {
              instrument_id: true,
              name: true,
            },
          },
        },
      });
    } catch (error) {
      if (
        error instanceof ForbiddenException ||
        error instanceof NotFoundException ||
        error instanceof BadRequestException
      ) {
        throw error;
      }
      console.error('ERROR CREATE OPENING =>', error);
      throw new InternalServerErrorException('Error al crear la convocatoria');
    }
  }

  async getOpenings(bandId: string) {
    await this.findBandOrFail(bandId);

    return this.prisma.band_openings.findMany({
      where: { band_id: bandId },
      select: {
        opening_id: true,
        band_id: true,
        description: true,
        status: true,
        created_at: true,
        updated_at: true,
        instrument: {
          select: {
            instrument_id: true,
            name: true,
          },
        },
        places: {
          select: {
            place_id: true,
            city: true,
            country: true,
          },
        },
      },
      orderBy: { created_at: 'desc' },
    });
  }

  async updateOpening(
    userId: string,
    bandId: string,
    openingId: string,
    dto: UpdateOpeningDTO,
  ) {
    try {
      await this.ensureOwner(userId, bandId);

      const opening = await this.prisma.band_openings.findFirst({
        where: { opening_id: openingId, band_id: bandId },
        select: { opening_id: true },
      });

      if (!opening) {
        throw new NotFoundException('Convocatoria no encontrada en esta banda');
      }

      return await this.prisma.band_openings.update({
        where: { opening_id: openingId },
        data: {
          ...(dto.description !== undefined && { description: dto.description }),
          ...(dto.place_id !== undefined && { place_id: dto.place_id }),
          ...(dto.status !== undefined && { status: dto.status }),
          updated_at: new Date(),
        },
        select: {
          opening_id: true,
          band_id: true,
          description: true,
          status: true,
          updated_at: true,
          instrument: {
            select: {
              instrument_id: true,
              name: true,
            },
          },
        },
      });
    } catch (error) {
      if (
        error instanceof ForbiddenException ||
        error instanceof NotFoundException ||
        error instanceof BadRequestException
      ) {
        throw error;
      }
      console.error('ERROR UPDATE OPENING =>', error);
      throw new InternalServerErrorException(
        'Error al actualizar la convocatoria',
      );
    }
  }

  async deleteOpening(userId: string, bandId: string, openingId: string) {
    try {
      await this.ensureOwner(userId, bandId);

      const opening = await this.prisma.band_openings.findFirst({
        where: { opening_id: openingId, band_id: bandId },
        select: { opening_id: true },
      });

      if (!opening) {
        throw new NotFoundException('Convocatoria no encontrada en esta banda');
      }

      await this.prisma.band_openings.delete({
        where: { opening_id: openingId },
      });

      return { message: 'Convocatoria eliminada correctamente' };
    } catch (error) {
      if (
        error instanceof ForbiddenException ||
        error instanceof NotFoundException
      ) {
        throw error;
      }
      console.error('ERROR DELETE OPENING =>', error);
      throw new InternalServerErrorException(
        'Error al eliminar la convocatoria',
      );
    }
  }

  private async findBandOrFail(bandId: string) {
    const band = await this.prisma.bands.findUnique({
      where: { band_id: bandId },
      select: { band_id: true, owner_user_id: true },
    });

    if (!band) {
      throw new NotFoundException('Banda no encontrada');
    }

    return band;
  }

  private async ensureOwner(userId: string, bandId: string) {
    const band = await this.findBandOrFail(bandId);

    if (band.owner_user_id !== userId) {
      throw new ForbiddenException(
        'Solo el creador de la banda puede realizar esta acción',
      );
    }
  }
}