import { ConflictException, Injectable, InternalServerErrorException, NotFoundException, BadRequestException } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from './../prisma/prisma.service';
import { CreateMusicianDTO } from './dto/musician.dto';
import { AuthService } from 'src/auth/auth.service';
import { UpdateProfileDTO } from './dto/update-profile.dto';
import { AddGenresDTO } from './dto/addGenres.dto';
import { DiscoverMusiciansDTO } from './dto/discover-musician.dto';
import { AddInstrumentDTO, UpdateInstrumentDTO } from './dto/instrument.dto';


@Injectable()
export class MusicianService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authService: AuthService
  ) { }

  async createMusician(userId: string, dto: CreateMusicianDTO) {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const existingProfile = await tx.musician_profile.findUnique({
          where: {
            user_id: userId,
          },
          select: {
            musician_id: true,
          },
        });

        if (existingProfile) {
          throw new ConflictException(
            'Ya existe un perfil de músico para este usuario',
          );
        }

        const musician = await tx.musician_profile.create({
          data: {
            user_id: userId,
            years_experience: dto.experience ?? 0,
            skill_summary: dto.summary ?? null,
          },
          select: {
            musician_id: true,
            user_id: true,
            years_experience: true,
            skill_summary: true,
            created_at: true,
          },
        });

        await this.ensureMusicianRole(tx, userId);

        return musician;
      });
    } catch (error) {
      if (error instanceof ConflictException) {
        throw error;
      }

      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException(
          'Ya existe un perfil de músico para este usuario',
        );
      }

      throw new InternalServerErrorException(
        'Error en la creación del perfil de músico',
      );
    }
  }

  async updateMusicianProfile(userId: string, dto: UpdateProfileDTO) {
    try {
      return await this.prisma.$transaction(async (tx) => {
        await this.ensureMusicianProfileExists(tx, userId);
        await this.ensureMusicianRole(tx, userId);

        const user = await tx.users.update({
          where: {
            user_id: userId,
          },
          data: {
            ...(dto.display_name !== undefined && {
              display_name: dto.display_name,
            }),
            ...(dto.bio !== undefined && {
              bio: dto.bio,
            }),
            ...(dto.phone !== undefined && {
              phone: dto.phone,
            }),
            ...(dto.profile_visibility !== undefined && {
              profile_visibility: dto.profile_visibility,
            }),
          },
          select: {
            user_id: true,
            email: true,
            username: true,
            display_name: true,
            bio: true,
            phone: true,
            birthdate: true,
            profile_visibility: true,
          },
        });

        const musicianProfile = await tx.musician_profile.update({
          where: {
            user_id: userId,
          },
          data: {
            ...(dto.years_experience !== undefined && {
              years_experience: dto.years_experience,
            }),
            ...(dto.skill_summary !== undefined && {
              skill_summary: dto.skill_summary,
            }),
          },
          select: {
            musician_id: true,
            years_experience: true,
            skill_summary: true,
          },
        });

        return {
          ...user,
          musician_profile: musicianProfile,
        };
      });
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }

      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2025'
      ) {
        throw new NotFoundException('Usuario o perfil de músico no encontrado');
      }

      throw new InternalServerErrorException(
        'Error en la actualización del perfil de músico',
      );
    }
  }

  async deleteMusicianProfile(userId: string) {
    return this.prisma.$transaction(async (tx) => {
      await this.ensureMusicianProfileExists(tx, userId);

      const activeBandMembership = await tx.band_members.findFirst({
        where: {
          user_id: userId,
          status: 'Activo',
          left_at: null,
        },
        select: {
          band_member_id: true,
        },
      });

      if (activeBandMembership) {
        throw new BadRequestException(
          'No puedes eliminar tu perfil de músico mientras sigas activo en una banda',
        );
      }

      await tx.musician_genre.deleteMany({
        where: {
          user_id: userId,
        },
      });

      await tx.musician_instrument.deleteMany({
        where: {
          user_id: userId,
        },
      });

      await tx.musician_profile.delete({
        where: {
          user_id: userId,
        },
      });

      await tx.user_roles.deleteMany({
        where: {
          user_id: userId,
          role: 'MUSICIAN',
        },
      });

      return {
        message: 'Perfil de músico eliminado correctamente',
      };
    });
  }

  async getMyProfilePage(userId: string) {
    const user = await this.prisma.users.findUnique({
      where: {
        user_id: userId,
      },
      select: {
        user_id: true,
        username: true,
        display_name: true,
        bio: true,
        phone: true,
        birthdate: true,
        profile_visibility: true,
        created_at: true,

        places: {
          select: {
            city: true,
            region: true,
            country: true,
          },
        },

        musician_profile: {
          select: {
            musician_id: true,
            years_experience: true,
            skill_summary: true,
          },
        },

        musician_instrument: {
          select: {
            level: true,
            is_primary: true,
            instrument: {
              select: {
                name: true,
                category: true,
              },
            },
          },
        },

        musician_genre: {
          select: {
            genres: {
              select: {
                genre_id: true,
                name: true,
              },
            },
          },
        },

        user_media: {
          select: {
            kind: true,
            sort_order: true,
            media: {
              select: {
                url: true,
                media_type: true,
                mime_type: true,
              },
            },
          },
        },
      },
    });

    return user;
  }

  async discoverMusicians(currentUserId: string, query: DiscoverMusiciansDTO) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 12;
    const skip = (page - 1) * limit;

    const where: Prisma.usersWhereInput = {
      user_id: {
        not: currentUserId,
      },
      is_active: true,
      musician_profile: {
        isNot: null,
      },
      NOT: {
        profile_visibility: 'private',
      },
      OR: query.q
        ? [
          {
            username: {
              contains: query.q,
              mode: 'insensitive',
            },
          },
          {
            display_name: {
              contains: query.q,
              mode: 'insensitive',
            },
          },
          {
            bio: {
              contains: query.q,
              mode: 'insensitive',
            },
          },
        ]
        : undefined,
      musician_instrument: query.instrument_id || query.level
        ? {
          some: {
            ...(query.instrument_id && { instrument_id: query.instrument_id }),
            ...(query.level && { level: query.level }),
          },
        }
        : undefined,
      musician_genre: query.genre_id
        ? {
          some: {
            genre_id: query.genre_id,
          },
        }
        : undefined,
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.users.findMany({
        where,
        skip,
        take: limit,
        orderBy: { created_at: 'desc' },
        select: {
          user_id: true,
          username: true,
          display_name: true,
          bio: true,
          profile_visibility: true,
          places: {
            select: {
              city: true,
              region: true,
              country: true,
            },
          },
          musician_profile: {
            select: {
              years_experience: true,
              skill_summary: true,
            },
          },
          musician_instrument: {
            select: {
              level: true,
              is_primary: true,
              instrument: {
                select: {
                  instrument_id: true,
                  name: true,
                  category: true,
                },
              },
            },
          },
          musician_genre: {
            select: {
              genres: {
                select: {
                  genre_id: true,
                  name: true,
                },
              },
            },
          },
          user_media: {
            take: 1,
            orderBy: { sort_order: 'asc' },
            select: {
              kind: true,
              media: {
                select: {
                  url: true,
                  media_type: true,
                },
              },
            },
          },
        },
      }),
      this.prisma.users.count({ where }),
    ]);

    return {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
      items: items.map((item) => ({
        ...item,
        phone: undefined,
        birthdate: undefined,
      })),
    };
  }

  async getPublicMusicianProfile(userId: string) {
    const user = await this.prisma.users.findUnique({
      where: { user_id: userId },
      select: {
        user_id: true,
        username: true,
        display_name: true,
        bio: true,
        profile_visibility: true,
        created_at: true,

        places: {
          select: {
            city: true,
            region: true,
            country: true,
          },
        },

        musician_profile: {
          select: {
            musician_id: true,
            years_experience: true,
            skill_summary: true,
          },
        },

        musician_instrument: {
          select: {
            musician_instrument_id: true,
            level: true,
            is_primary: true,
            instrument: {
              select: {
                instrument_id: true,
                name: true,
                category: true,
              },
            },
          },
        },

        musician_genre: {
          select: {
            genres: {
              select: {
                genre_id: true,
                name: true,
              },
            },
          },
        },

        user_media: {
          select: {
            kind: true,
            sort_order: true,
            media: {
              select: {
                url: true,
                media_type: true,
                mime_type: true,
              },
            },
          },
        },
      },
    });

    if (!user) {
      throw new NotFoundException('Perfil no encontrado');
    }

    if (user.profile_visibility === 'private') {
      return {
        user_id: user.user_id,
        username: user.username,
        display_name: user.display_name,
        profile_visibility: user.profile_visibility,
        message: 'Este perfil es privado',
      };
    }

    return user;
  }

  async getInstrumentCatalog(search?: string) {
    return this.prisma.instrument.findMany({
      where: search
        ? {
          name: {
            contains: search,
            mode: 'insensitive',
          },
        }
        : undefined,
      select: {
        instrument_id: true,
        name: true,
        category: true,
      },
      orderBy: [{ category: 'asc' }, { name: 'asc' }],
      take: 50,
    });
  }

  async getGenreCatalog(search?: string) {
    return this.prisma.genres.findMany({
      where: search
        ? {
          name: {
            contains: search,
            mode: 'insensitive',
          },
        }
        : undefined,
      select: {
        genre_id: true,
        name: true,
      },
      orderBy: { name: 'asc' },
      take: 50,
    });
  }

  async getBandsForMusician(userId: string) {
    return this.prisma.band_members.findMany({
      where: {
        user_id: userId,
        status: 'Activo',
        left_at: null,
      },
      select: {
        band_member_id: true,
        role: true,
        status: true,
        joined_at: true,
        bands: {
          select: {
            band_id: true,
            name: true,
            description: true,
            band_genres: {
              select: {
                genres: {
                  select: {
                    genre_id: true,
                    name: true,
                  },
                },
              },
            },
          },
        },
      },
    });
  }

  async addGenresToMusician(userId: string, dto: AddGenresDTO) {
    return this.prisma.$transaction(async (tx) => {
      await this.ensureMusicianProfileExists(tx, userId);
      const validGenreIds = await this.ensureGenresExist(tx, dto.genre_ids);

      await tx.musician_genre.createMany({
        data: validGenreIds.map((genreId) => ({
          user_id: userId,
          genre_id: genreId,
        })),
        skipDuplicates: true,
      });

      return tx.musician_genre.findMany({
        where: {
          user_id: userId,
        },
        select: {
          genres: {
            select: {
              genre_id: true,
              name: true,
            },
          },
        },
      });
    });
  }

  async removeGenreFromMusician(userId: string, genreId: string) {
    await this.prisma.musician_genre.deleteMany({
      where: {
        user_id: userId,
        genre_id: genreId,
      },
    });

    return { message: 'Género eliminado correctamente' };
  }

  async addInstrumentToMusician(userId: string, dto: AddInstrumentDTO) {
    try {
      return await this.prisma.$transaction(async (tx) => {
        await this.ensureMusicianProfileExists(tx, userId);
        await this.ensureInstrumentExists(tx, dto.instrument_id);

        if (dto.is_primary) {
          await tx.musician_instrument.updateMany({
            where: {
              user_id: userId,
            },
            data: {
              is_primary: false,
            },
          });
        }

        return tx.musician_instrument.create({
          data: {
            user_id: userId,
            instrument_id: dto.instrument_id,
            level: dto.level ?? null,
            is_primary: dto.is_primary ?? false,
          },
          select: {
            musician_instrument_id: true,
            instrument_id: true,
            level: true,
            is_primary: true,
          },
        });
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException(
          'Ese instrumento ya fue agregado al perfil del músico',
        );
      }

      throw error;
    }
  }
  async updateMusicianInstrument(
    userId: string,
    musicianInstrumentId: string,
    dto: UpdateInstrumentDTO,
  ) {
    return this.prisma.$transaction(async (tx) => {
      if (dto.is_primary) {
        await tx.musician_instrument.updateMany({
          where: {
            user_id: userId,
            NOT: { musician_instrument_id: musicianInstrumentId },
          },
          data: { is_primary: false },
        });
      }

      const updated = await tx.musician_instrument.updateMany({
        where: {
          musician_instrument_id: musicianInstrumentId,
          user_id: userId,
        },
        data: {
          ...(dto.level !== undefined && { level: dto.level }),
          ...(dto.is_primary !== undefined && { is_primary: dto.is_primary }),
        },
      });

      if (updated.count === 0) {
        throw new NotFoundException('Instrumento no encontrado para este músico');
      }

      return { message: 'Instrumento actualizado correctamente' };
    });
  }
  async removeMusicianInstrument(userId: string, musicianInstrumentId: string) {
    const deleted = await this.prisma.musician_instrument.deleteMany({
      where: {
        musician_instrument_id: musicianInstrumentId,
        user_id: userId,
      },
    });

    if (deleted.count === 0) {
      throw new NotFoundException('Instrumento no encontrado para este músico');
    }

    return { message: 'Instrumento eliminado correctamente' };
  }

  async findMusiciansByInstrument(
    currentUserId: string,
    instrumentId: string,
    level?: string,
    limit = 20,
    offset = 0,
  ) {
    return this.prisma.$transaction(async (tx) => {
      await this.ensureInstrumentExists(tx, instrumentId);

      const musicians = await tx.users.findMany({
        where: {
          user_id: {
            not: currentUserId,
          },
          is_active: true,
          musician_profile: {
            isNot: null,
          },
          OR: [
            { profile_visibility: 'public' },
            { profile_visibility: null },
          ],
          musician_instrument: {
            some: {
              instrument_id: instrumentId,
              ...(level !== undefined && { level }),
            },
          },
        },
        select: this.getMusicianCardSelect(),
        orderBy: [
          { display_name: 'asc' },
        ],
        take: limit,
        skip: offset,
      });

      return musicians;
    });
  }

  async findMusiciansByGenre(
    currentUserId: string,
    genreId: string,
    limit = 20,
    offset = 0,
  ) {
    return this.prisma.$transaction(async (tx) => {
      await this.ensureGenreExists(tx, genreId);

      const musicians = await tx.users.findMany({
        where: {
          user_id: {
            not: currentUserId,
          },
          is_active: true,
          musician_profile: {
            isNot: null,
          },
          OR: [
            { profile_visibility: 'public' },
            { profile_visibility: null },
          ],
          musician_genre: {
            some: {
              genre_id: genreId,
            },
          },
        },
        select: this.getMusicianCardSelect(),
        orderBy: [
          { display_name: 'asc' },
        ],
        take: limit,
        skip: offset,
      });

      return musicians;
    });
  }

  private async ensureMusicianRole(tx: Prisma.TransactionClient, userId: string) {
    const existingRole = await tx.user_roles.findFirst({
      where: {
        user_id: userId,
        role: 'MUSICIAN',
      },
      select: {
        user_role_id: true,
      },
    });

    if (!existingRole) {
      await tx.user_roles.create({
        data: {
          user_id: userId,
          role: 'MUSICIAN',
        },
      });
    }
  }

  private async ensureMusicianProfileExists(
    tx: Prisma.TransactionClient,
    userId: string,
  ) {
    const profile = await tx.musician_profile.findUnique({
      where: {
        user_id: userId,
      },
      select: {
        musician_id: true,
      },
    });

    if (!profile) {
      throw new NotFoundException(
        'El usuario no tiene perfil de músico. Primero debes crearlo.',
      );
    }

    return profile;
  }

  private async ensureGenresExist(
    tx: Prisma.TransactionClient,
    genreIds: string[],
  ) {
    const uniqueGenreIds = [...new Set(genreIds)];

    const existingGenres = await tx.genres.findMany({
      where: {
        genre_id: {
          in: uniqueGenreIds,
        },
      },
      select: {
        genre_id: true,
      },
    });

    const existingIds = new Set(existingGenres.map((g) => g.genre_id));
    const missingIds = uniqueGenreIds.filter((id) => !existingIds.has(id));

    if (missingIds.length > 0) {
      throw new BadRequestException(
        `Los siguientes genre_id no existen: ${missingIds.join(', ')}`,
      );
    }

    return uniqueGenreIds;
  }

  private async ensureGenreExists(
    tx: Prisma.TransactionClient,
    genreId: string,
  ) {
    const genre = await tx.genres.findUnique({
      where: {
        genre_id: genreId,
      },
      select: {
        genre_id: true,
      },
    });

    if (!genre) {
      throw new BadRequestException('El genre_id enviado no existe');
    }
  }

  private async ensureInstrumentExists(
    tx: Prisma.TransactionClient,
    instrumentId: string,
  ) {
    const instrument = await tx.instrument.findUnique({
      where: {
        instrument_id: instrumentId,
      },
      select: {
        instrument_id: true,
      },
    });

    if (!instrument) {
      throw new BadRequestException('El instrument_id enviado no existe');
    }
  }

  private getMusicianCardSelect(): Prisma.usersSelect {
    return {
      user_id: true,
      username: true,
      display_name: true,
      bio: true,
      profile_visibility: true,

      places: {
        select: {
          city: true,
          region: true,
          country: true,
        },
      },

      musician_profile: {
        select: {
          musician_id: true,
          years_experience: true,
          skill_summary: true,
        },
      },

      musician_instrument: {
        select: {
          musician_instrument_id: true,
          level: true,
          is_primary: true,
          instrument: {
            select: {
              instrument_id: true,
              name: true,
              category: true,
            },
          },
        },
        orderBy: [
          { is_primary: 'desc' },
          { created_at: 'asc' },
        ],
      },

      musician_genre: {
        select: {
          genres: {
            select: {
              genre_id: true,
              name: true,
            },
          },
        },
      },

      user_media: {
        take: 1,
        orderBy: [
          { sort_order: 'asc' },
        ],
        select: {
          kind: true,
          sort_order: true,
          media: {
            select: {
              media_id: true,
              url: true,
              media_type: true,
              mime_type: true,
            },
          },
        },
      },
    };
  }

}
