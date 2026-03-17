import { ConflictException, Injectable, InternalServerErrorException, UnauthorizedException } from '@nestjs/common';
import { Prisma} from '../generated/prisma/client';
import { PrismaService } from './../prisma/prisma.service';
import { CreateMusicianDTO  } from './dto/musician.dto';
import { IsPhoneNumber } from 'class-validator';
import { AuthService } from 'src/auth/auth.service';


@Injectable()
export class MusicianService{
    constructor(
        private readonly prisma: PrismaService,
        private readonly authService: AuthService
    ){}

    async createMusician(userId: string, dto: CreateMusicianDTO ){
        try{
            const musician = await this.prisma.musician_profile.create({
                data:{
                    user_id: userId,
                    years_experience: dto.experience,
                    skill_summary: dto.summary
                }
            });
            await this.prisma.user_roles.create({
                data:{
                    user_id: userId,
                    role: 'MUSICIAN'
                }
            });
            return musician;
        } catch (error) {
            if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
                throw new ConflictException('Ya existe un perfil de músico para este usuario');
            }
            throw new InternalServerErrorException('Error en la creación del perfil de músico');
        }
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
}
   