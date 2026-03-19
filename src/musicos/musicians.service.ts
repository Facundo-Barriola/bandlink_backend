import { ConflictException, Injectable, InternalServerErrorException, NotFoundException, BadRequestException } from '@nestjs/common';
import { Prisma} from '../generated/prisma/client';
import { PrismaService } from './../prisma/prisma.service';
import { CreateMusicianDTO  } from './dto/musician.dto';
import { AuthService } from 'src/auth/auth.service';
import { UpdateProfileDTO } from './dto/update-profile.dto';
import { AddGenresDTO } from './dto/addGenres.dto';
import { AddInstrumentDTO, UpdateInstrumentDTO } from './dto/instrument.dto';


@Injectable()
export class MusicianService{
  constructor(
    private readonly prisma: PrismaService,
    private readonly authService: AuthService
  ){}

  async createMusician(userId: string, dto: CreateMusicianDTO ){
      try{
        const result = await this.prisma.$transaction(async (tx) => {
          const musician = await tx.musician_profile.create({
            data: {
              user_id: userId,
              years_experience: dto.experience ?? 0,
              skill_summary: dto.summary ?? null,
            },
          });

          await tx.user_roles.create(
          {
            data: {
                user_id: userId,
                role: 'MUSICIAN',
              },
          });

          return musician;
        });
          
        return result;
      } 
      catch (error) 
      {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
          throw new ConflictException('Ya existe un perfil de músico para este usuario');
        }
        throw new InternalServerErrorException('Error en la creación del perfil de músico');
      }
  }

  async updateMusicianProfile(userId: string, dto: UpdateProfileDTO) {
      try{
      
        const result = await this.prisma.$transaction(async (tx) => {
          const user = await tx.users.update({
            where: { user_id: userId },
            data: {
              ...(dto.display_name !== undefined && { display_name: dto.display_name }),
              ...(dto.bio !== undefined && { bio: dto.bio }),
              ...(dto.phone !== undefined && { phone: dto.phone }),
              ...(dto.profile_visibility !== undefined && { profile_visibility: dto.profile_visibility }),
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

          const musicianProfile = await tx.musician_profile.upsert({
            where: { user_id: userId },
            update: { 
              ...(dto.years_experience !== undefined && { years_experience: dto.years_experience }),
              ...(dto.skill_summary !== undefined && { skill_summary: dto.skill_summary }),
            },
            create: {
              user_id: userId,
              years_experience: dto.years_experience ?? 0,
              skill_summary: dto.skill_summary ?? null,
            },
            select:{
              musician_id: true,
              years_experience: true,
              skill_summary: true,
            }
        });
        return{
          ...user,
          musician_profile: musicianProfile,
        }
      });
      return result;
      } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2025'
      ) {
        throw new NotFoundException('Usuario no encontrado');
      }

      throw new InternalServerErrorException(
        'Error en la actualización del perfil de músico',
      );      }
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

  async getBandsForMusician(userId: string) {
        const bandsWhereUserIsMemeber = await this.prisma.band_members.findMany({
            where: {
                user_id: userId,
                status: 'ACTIVE'
            },include: {
                bands: {
                    select: {
                        band_id: true,
                        name: true,
                        description: true,
                    },
                    include:{
                        band_genres: {
                            select: {
                                genres: {
                                    select: {
                                        name: true
                                    }
                                }
                            }
                        },

                    }
                }
            }
        });

        return bandsWhereUserIsMemeber;
  }

  async addGenresToMusician(userId: string, dto: AddGenresDTO) {
    await this.prisma.musician_genre.createMany({
      data: dto.genre_ids.map((genreId) => ({
        user_id: userId,
        genre_id: genreId,
      })),
      skipDuplicates: true,
    });

    return this.prisma.musician_genre.findMany({
      where: { user_id: userId },
      select: {
        genres: {
          select: {
            genre_id: true,
            name: true,
          },
        },
      },
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
    return this.prisma.$transaction(async (tx) => {
      if (dto.is_primary) {
        await tx.musician_instrument.updateMany({
          where: { user_id: userId },
          data: { is_primary: false },
        });
      }
    
      const instrument = await tx.musician_instrument.create({
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
    
      return instrument;
    });
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
}
   