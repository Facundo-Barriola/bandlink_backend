import { Injectable, ConflictException, InternalServerErrorException, NotFoundException, ForbiddenException } from '@nestjs/common';
import { CreateStudioDTO } from './dto/create-studio.dto';
import { UpdateStudioDTO } from './dto/update-studio.dto';
import { UpdateRoomDTO } from './dto/update-room.dto';
import { CreateRoomDTO } from './dto/create-room.dto';
import { PrismaService } from 'src/prisma/prisma.service';
import { Prisma } from '../generated/prisma/client';


@Injectable()
export class StudiosService {
    constructor(private readonly prisma: PrismaService) { }

    async createStudio(userId: string, dto: CreateStudioDTO) {
        try {
            const result = await this.prisma.$transaction(async (tx) => {
                const studio = await tx.studios.create({
                    data: {
                        name: dto.name,
                        place_id: dto.place_id,
                        owner_user_id: userId,
                    }
                });

                await tx.user_roles.create({
                    data: {
                        user_id: userId,
                        role: 'studio_owner'
                    }
                });
                return studio;
            });


        } catch (error) {
            if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
                throw new ConflictException('Ya existe un perfil de estudio para este usuario');
            }
            console.error('ERROR REGISTER USER =>', error);
            throw new InternalServerErrorException('Error en la creación del perfil de estudio');
        }
    }

    async getMyStudios(userId: string) {
        return this.prisma.studios.findMany({
            where: {
                owner_user_id: userId,
            },
            select: {
                studio_id: true,
                name: true,
                description: true,
                phone: true,
                is_active: true,
                created_at: true,
                places: {
                    select: {
                        place_id: true,
                        address_line1: true,
                        city: true,
                        region: true,
                        country: true,
                    },
                },
                _count: {
                    select: {
                        rehearsal_rooms: true,
                    },
                },
            },
            orderBy: {
                created_at: 'desc',
            },
        });
    }

    async getStudioById(studioId: string) {
        const studio = await this.prisma.studios.findUnique({
            where: {
                studio_id: studioId,
            },
            select: {
                studio_id: true,
                owner_user_id: true,
                name: true,
                description: true,
                phone: true,
                is_active: true,
                created_at: true,

                users: {
                    select: {
                        user_id: true,
                        username: true,
                        display_name: true,
                    },
                },

                places: {
                    select: {
                        place_id: true,
                        name: true,
                        address_line1: true,
                        address_line2: true,
                        city: true,
                        region: true,
                        postal_code: true,
                        country: true,
                        lat: true,
                        lng: true,
                    },
                },

                rehearsal_rooms: {
                    where: {
                        studio_id: studioId,
                    },
                    select: {
                        room_id: true,
                        name: true,
                        description: true,
                        capacity: true,
                        base_hourly_price: true,
                        min_booking_minutes: true,
                    },
                    orderBy: {
                        name: 'asc',
                    },
                },

                _count: {
                    select: {
                        rehearsal_rooms: true,
                        studio_reviews: true,
                    },
                },
            },
        });

        if (!studio) {
            throw new NotFoundException('Estudio no encontrado');
        }

        return studio;
    }

    async updateStudio(userId: string, studioId: string, dto: UpdateStudioDTO) {
        try {
            const existingStudio = await this.prisma.studios.findUnique({
                where: {
                    studio_id: studioId,
                },
                select: {
                    studio_id: true,
                    owner_user_id: true,
                },
            });

            if (!existingStudio) {
                throw new NotFoundException('Estudio no encontrado');
            }

            if (existingStudio.owner_user_id !== userId) {
                throw new ForbiddenException('No tienes permisos para actualizar este estudio');
            }

            const updatedStudio = await this.prisma.studios.update({
                where: {
                    studio_id: studioId,
                },
                data: {
                    ...(dto.name !== undefined && { name: dto.name }),
                    ...(dto.description !== undefined && { description: dto.description }),
                    ...(dto.phone !== undefined && { phone: dto.phone }),
                    ...(dto.place_id !== undefined && { place_id: dto.place_id }),
                    ...(dto.is_active !== undefined && { is_active: dto.is_active }),
                },
                select: {
                    studio_id: true,
                    name: true,
                    description: true,
                    phone: true,
                    is_active: true,
                    place_id: true,
                },
            });

            return updatedStudio;
        } catch (error) {
            if (
                error instanceof NotFoundException ||
                error instanceof ForbiddenException
            ) {
                throw error;
            }

            if (
                error instanceof Prisma.PrismaClientKnownRequestError &&
                error.code === 'P2002'
            ) {
                throw new ConflictException('Conflicto al actualizar el estudio');
            }

            console.error('ERROR UPDATE STUDIO =>', error);
            throw new InternalServerErrorException(
                'Error en la actualización del perfil de estudio',
            );
        }
    }

    async setStudioActive(userId: string, studioId: string, isActive: boolean) { }

    async deleteStudio(userId: string, studioId: string) { }

    async createRoom(userId: string, studioId: string, dto: CreateRoomDTO) { }

    async updateRoom(studioId: string, roomId: string, dto: UpdateRoomDTO) { }

    async deleteRoom(studioId: string, roomId: string) { }

    async getRoomsByStudio(studioId: string) { }

}

