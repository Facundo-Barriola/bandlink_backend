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

    async setStudioActive(userId: string, studioId: string, isActive: boolean) {
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
                    is_active: isActive,
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
        }

    }
    async deleteStudio(userId: string, studioId: string) {
        try {
            const studio = await this.prisma.studios.findUnique({
                where: {
                    studio_id: studioId,
                },
                select: {
                    studio_id: true,
                    owner_user_id: true,
                    _count: {
                        select: {
                            rehearsal_rooms: true,
                        },
                    },
                },
            });

            if (!studio) {
                throw new NotFoundException('Estudio no encontrado');
            }

            if (studio.owner_user_id !== userId) {
                throw new ForbiddenException('No tienes permisos para eliminar este estudio');
            }

            if (studio._count.rehearsal_rooms > 0) {
                throw new ConflictException('No puedes eliminar un estudio que aún tiene salas');
            }

            const deletedStudio = await this.prisma.studios.delete({
                where: {
                    studio_id: studioId,
                },
                select: {
                    studio_id: true,
                    name: true,
                },
            });

            return deletedStudio;
        } catch (error) {
            if (
                error instanceof NotFoundException ||
                error instanceof ForbiddenException ||
                error instanceof ConflictException
            ) {
                throw error;
            }

            console.error('ERROR DELETE STUDIO =>', error);
            throw new InternalServerErrorException('Error al eliminar el estudio');
        }
    }

    async createRoom(userId: string, studioId: string, dto: CreateRoomDTO) {
        try {
            const studio = await this.prisma.studios.findUnique({
                where: {
                    studio_id: studioId,
                },
                select: {
                    studio_id: true,
                    owner_user_id: true,
                },
            });

            if (!studio) {
                throw new NotFoundException('Estudio no encontrado');
            }

            if (studio.owner_user_id !== userId) {
                throw new ForbiddenException('No tienes permisos para crear salas en este estudio');
            }

            const room = await this.prisma.rehearsal_rooms.create({
                data: {
                    studio_id: studioId,
                    name: dto.name,
                    ...(dto.description !== undefined && { description: dto.description }),
                    ...(dto.capacity !== undefined && { capacity: dto.capacity }),
                    ...(dto.base_hourly_price !== undefined && { base_hourly_price: dto.base_hourly_price }),
                    ...(dto.min_booking_minutes !== undefined && { min_booking_minutes: dto.min_booking_minutes }),
                },
                select: {
                    room_id: true,
                    studio_id: true,
                    name: true,
                    description: true,
                    capacity: true,
                    base_hourly_price: true,
                    min_booking_minutes: true,
                    created_at: true,
                    updated_at: true,
                },
            });

            return room;
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
                throw new ConflictException('Ya existe una sala con esos datos en este estudio');
            }

            console.error('ERROR CREATE ROOM =>', error);
            throw new InternalServerErrorException('Error al crear la sala');
        }
    }

    async updateRoom(userId: string, studioId: string, roomId: string, dto: UpdateRoomDTO) {
        try {
            const room = await this.prisma.rehearsal_rooms.findUnique({
                where: {
                    room_id: roomId,
                },
                select: {
                    room_id: true,
                    studio_id: true,
                    studios: {
                        select: {
                            owner_user_id: true,
                        },
                    },
                },
            });

            if (!room) {
                throw new NotFoundException('Sala no encontrada');
            }

            if (room.studio_id !== studioId) {
                throw new NotFoundException('La sala no pertenece al estudio indicado');
            }

            if (room.studios.owner_user_id !== userId) {
                throw new ForbiddenException('No tienes permisos para actualizar esta sala');
            }

            const updatedRoom = await this.prisma.rehearsal_rooms.update({
                where: {
                    room_id: roomId,
                },
                data: {
                    ...(dto.name !== undefined && { name: dto.name }),
                    ...(dto.description !== undefined && { description: dto.description }),
                    ...(dto.capacity !== undefined && { capacity: dto.capacity }),
                    ...(dto.base_hourly_price !== undefined && { base_hourly_price: dto.base_hourly_price }),
                    ...(dto.min_booking_minutes !== undefined && { min_booking_minutes: dto.min_booking_minutes }),
                },
                select: {
                    room_id: true,
                    studio_id: true,
                    name: true,
                    description: true,
                    capacity: true,
                    base_hourly_price: true,
                    min_booking_minutes: true,
                    created_at: true,
                    updated_at: true,
                },
            });

            return updatedRoom;
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
                throw new ConflictException('Conflicto al actualizar la sala');
            }

            console.error('ERROR UPDATE ROOM =>', error);
            throw new InternalServerErrorException('Error al actualizar la sala');
        }
    }

    async deleteRoom(userId: string, studioId: string, roomId: string) {
        try {
            const room = await this.prisma.rehearsal_rooms.findUnique({
                where: {
                    room_id: roomId,
                },
                select: {
                    room_id: true,
                    studio_id: true,
                    studios: {
                        select: {
                            owner_user_id: true,
                        },
                    },
                },
            });

            if (!room) {
                throw new NotFoundException('Sala no encontrada');
            }

            if (room.studio_id !== studioId) {
                throw new NotFoundException('La sala no pertenece al estudio indicado');
            }

            if (room.studios.owner_user_id !== userId) {
                throw new ForbiddenException('No tienes permisos para eliminar esta sala');
            }

            const deletedRoom = await this.prisma.rehearsal_rooms.delete({
                where: {
                    room_id: roomId,
                },
                select: {
                    room_id: true,
                    studio_id: true,
                    name: true,
                },
            });

            return deletedRoom;
        } catch (error) {
            if (
                error instanceof NotFoundException ||
                error instanceof ForbiddenException
            ) {
                throw error;
            }

            if (
                error instanceof Prisma.PrismaClientKnownRequestError &&
                (error.code === 'P2003' || error.code === 'P2014')
            ) {
                throw new ConflictException('No puedes eliminar una sala con datos relacionados');
            }

            console.error('ERROR DELETE ROOM =>', error);
            throw new InternalServerErrorException('Error al eliminar la sala');
        }
    }

    async getRoomsByStudio(studioId: string) {
        const studio = await this.prisma.studios.findUnique({
            where: {
                studio_id: studioId,
            },
            select: {
                studio_id: true,
            },
        });

        if (!studio) {
            throw new NotFoundException('Estudio no encontrado');
        }

        return this.prisma.rehearsal_rooms.findMany({
            where: {
                studio_id: studioId,
            },
            select: {
                room_id: true,
                studio_id: true,
                name: true,
                description: true,
                capacity: true,
                base_hourly_price: true,
                min_booking_minutes: true,
                created_at: true,
                updated_at: true,
                room_equipment: {
                    select: {
                        room_equipment_id: true,
                        quantity: true,
                        equipment: {
                            select: {
                                equipment_id: true,
                                name: true,
                                category: true,
                            },
                        },
                    },
                },
                _count: {
                    select: {
                        bookings: true,
                        room_blocks: true,
                        room_availability_rules: true,
                    },
                },
            },
            orderBy: {
                name: 'asc',
            },
        });
    }

}

