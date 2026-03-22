import { Injectable, ConflictException, InternalServerErrorException, BadRequestException, NotFoundException, ForbiddenException } from '@nestjs/common';
import { CreateStudioDTO } from './dto/create-studio.dto';
import { UpdateStudioDTO } from './dto/update-studio.dto';
import { UpdateRoomDTO } from './dto/update-room.dto';
import { CreateRoomDTO } from './dto/create-room.dto';
import { SearchStudiosDTO } from './dto/search-studio.dto';
import { PrismaService } from 'src/prisma/prisma.service';
import { Prisma } from '../generated/prisma/client';


@Injectable()
export class StudiosService {
    constructor(private readonly prisma: PrismaService) { }

    async createStudio(userId: string, dto: CreateStudioDTO) {
        try {
            const result = await this.prisma.$transaction(async (tx) => {
                //await this.ensurePlaceExists(tx, dto.place_id);

                const studio = await tx.studios.create({
                    data: {
                        name: dto.name,
                        description: dto.description ?? null,
                        phone: dto.phone ?? null,
                        place_id: dto.place_id ?? null,
                        owner_user_id: userId,
                    },
                    select: {
                        studio_id: true,
                        owner_user_id: true,
                        name: true,
                        description: true,
                        phone: true,
                        place_id: true,
                        is_active: true,
                        created_at: true,
                    },
                });

                await this.ensureStudioOwnerRole(tx, userId);

                return studio;
            });

            return result;
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
                throw new ConflictException('Conflicto al crear el estudio');
            }

            console.error('ERROR CREATE STUDIO =>', error);
            throw new InternalServerErrorException(
                'Error en la creación del perfil de estudio',
            );
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
            return await this.prisma.$transaction(async (tx) => {
                await this.getOwnedStudioOrThrow(tx, userId, studioId);
                //await this.ensurePlaceExists(tx, dto.place_id);

                return tx.studios.update({
                    where: {
                        studio_id: studioId,
                    },
                    data: {
                        ...(dto.name !== undefined && { name: dto.name }),
                        ...(dto.description !== undefined && {
                            description: dto.description,
                        }),
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
            });
        } catch (error) {
            if (
                error instanceof NotFoundException ||
                error instanceof ForbiddenException ||
                error instanceof BadRequestException
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
            return await this.prisma.$transaction(async (tx) => {
                await this.getOwnedStudioOrThrow(tx, userId, studioId);

                return tx.studios.update({
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
            });
        } catch (error) {
            if (
                error instanceof NotFoundException ||
                error instanceof ForbiddenException
            ) {
                throw error;
            }

            console.error('ERROR SET STUDIO ACTIVE =>', error);
            throw new InternalServerErrorException(
                'Error al actualizar el estado del estudio',
            );
        }
    }
    async deleteStudio(userId: string, studioId: string) {
        try {
            return await this.prisma.$transaction(async (tx) => {
                await this.getOwnedStudioOrThrow(tx, userId, studioId);

                const activeBookings = await tx.bookings.findFirst({
                    where: {
                        rehearsal_rooms: {
                            studio_id: studioId,
                        },
                        status: {
                            in: ['PENDING', 'CONFIRMED'],
                        },
                    },
                    select: {
                        booking_id: true,
                    },
                });

                if (activeBookings) {
                    throw new BadRequestException(
                        'No puedes desactivar el estudio porque tiene reservas activas',
                    );
                }

                await tx.rehearsal_rooms.updateMany({
                    where: {
                        studio_id: studioId,
                    },
                    data: {
                        is_active: false,
                    },
                });

                const studio = await tx.studios.update({
                    where: {
                        studio_id: studioId,
                    },
                    data: {
                        is_active: false,
                    },
                    select: {
                        studio_id: true,
                        is_active: true,
                    },
                });

                const otherStudios = await tx.studios.count({
                    where: {
                        owner_user_id: userId,
                        is_active: true,
                        NOT: {
                            studio_id: studioId,
                        },
                    },
                });

                if (otherStudios === 0) {
                    await tx.user_roles.deleteMany({
                        where: {
                            user_id: userId,
                            role: 'STUDIO_OWNER',
                        },
                    });
                }

                return {
                    message: 'Estudio desactivado correctamente',
                    studio,
                };
            });
        } catch (error) {
            if (
                error instanceof NotFoundException ||
                error instanceof ForbiddenException ||
                error instanceof BadRequestException
            ) {
                throw error;
            }

            console.error('ERROR DELETE STUDIO =>', error);
            throw new InternalServerErrorException(
                'Error al desactivar el estudio',
            );
        }
    }

    async createRoom(userId: string, studioId: string, dto: CreateRoomDTO) {
        try {
            return await this.prisma.$transaction(async (tx) => {
                await this.getOwnedStudioOrThrow(tx, userId, studioId);

                return tx.rehearsal_rooms.create({
                    data: {
                        studio_id: studioId,
                        name: dto.name,
                        description: dto.description ?? null,
                        capacity: dto.capacity ?? null,
                        base_hourly_price: dto.base_hourly_price ?? null,
                        min_booking_minutes: dto.min_booking_minutes ?? null,
                        is_active: dto.is_active ?? null,
                    },
                    select: {
                        room_id: true,
                        studio_id: true,
                        name: true,
                        description: true,
                        capacity: true,
                        base_hourly_price: true,
                        min_booking_minutes: true,
                        is_active: true,
                        created_at: true,
                    },
                });
            });
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
                throw new ConflictException('Conflicto al crear la sala');
            }

            console.error('ERROR CREATE ROOM =>', error);
            throw new InternalServerErrorException('Error al crear la sala');
        }
    }

    async updateRoom(
        userId: string,
        studioId: string,
        roomId: string,
        dto: UpdateRoomDTO,
    ) {
        try {
            return await this.prisma.$transaction(async (tx) => {
                await this.getOwnedRoomOrThrow(tx, userId, studioId, roomId);

                return tx.rehearsal_rooms.update({
                    where: {
                        room_id: roomId,
                    },
                    data: {
                        ...(dto.name !== undefined && { name: dto.name }),
                        ...(dto.description !== undefined && {
                            description: dto.description,
                        }),
                        ...(dto.capacity !== undefined && { capacity: dto.capacity }),
                        ...(dto.base_hourly_price !== undefined && {
                            base_hourly_price: dto.base_hourly_price,
                        }),
                        ...(dto.min_booking_minutes !== undefined && {
                            min_booking_minutes: dto.min_booking_minutes,
                        }),
                        ...(dto.is_active !== undefined && { is_active: dto.is_active }),
                    },
                    select: {
                        room_id: true,
                        studio_id: true,
                        name: true,
                        description: true,
                        capacity: true,
                        base_hourly_price: true,
                        min_booking_minutes: true,
                        is_active: true,
                    },
                });
            });
        } catch (error) {
            if (
                error instanceof NotFoundException ||
                error instanceof ForbiddenException ||
                error instanceof BadRequestException
            ) {
                throw error;
            }

            console.error('ERROR UPDATE ROOM =>', error);
            throw new InternalServerErrorException(
                'Error en la actualización de la sala',
            );
        }
    }

    async deleteRoom(userId: string, studioId: string, roomId: string) {
        try {
            return await this.prisma.$transaction(async (tx) => {
                await this.getOwnedRoomOrThrow(tx, userId, studioId, roomId);

                const activeBookings = await tx.bookings.findFirst({
                    where: {
                        room_id: roomId,
                        status: {
                            in: ['PENDING', 'CONFIRMED'],
                        },
                    },
                    select: {
                        booking_id: true,
                    },
                });

                if (activeBookings) {
                    throw new BadRequestException(
                        'No puedes desactivar la sala porque tiene reservas activas',
                    );
                }

                const room = await tx.rehearsal_rooms.update({
                    where: {
                        room_id: roomId,
                    },
                    data: {
                        is_active: false,
                    },
                    select: {
                        room_id: true,
                        studio_id: true,
                        is_active: true,
                    },
                });

                return {
                    message: 'Sala desactivada correctamente',
                    room,
                };
            });
        } catch (error) {
            if (
                error instanceof NotFoundException ||
                error instanceof ForbiddenException ||
                error instanceof BadRequestException
            ) {
                throw error;
            }

            console.error('ERROR DELETE ROOM =>', error);
            throw new InternalServerErrorException(
                'Error al desactivar la sala',
            );
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
                is_active: true,
                created_at: true,
            },
            orderBy: {
                name: 'asc',
            },
        });
    }

    async searchStudiosByName(query: SearchStudiosDTO) {
        const search = query.name.trim();

        if (!search) {
            throw new BadRequestException('Debes enviar un nombre para buscar estudios');
        }

        return this.prisma.studios.findMany({
            where: {
                is_active: true,
                name: {
                    contains: search,
                    mode: 'insensitive',
                },
            },
            select: {
                studio_id: true,
                owner_user_id: true,
                name: true,
                description: true,
                phone: true,
                is_active: true,
                created_at: true,
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
                _count: {
                    select: {
                        rehearsal_rooms: true,
                        studio_reviews: true,
                    },
                },
            },
            orderBy: {
                name: 'asc',
            },
            take: query.limit ?? 20,
            skip: query.offset ?? 0,
        });
    }

    private async ensureStudioOwnerRole(
        tx: Prisma.TransactionClient,
        userId: string,
    ) {
        const existingRole = await tx.user_roles.findFirst({
            where: {
                user_id: userId,
                role: 'STUDIO_OWNER',
            },
            select: {
                user_role_id: true,
            },
        });

        if (!existingRole) {
            await tx.user_roles.create({
                data: {
                    user_id: userId,
                    role: 'STUDIO_OWNER',
                },
            });
        }
    }

    private async getOwnedStudioOrThrow(
        tx: Prisma.TransactionClient,
        userId: string,
        studioId: string,
    ) {
        const studio = await tx.studios.findUnique({
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
            throw new ForbiddenException(
                'No tienes permisos para administrar este estudio',
            );
        }

        return studio;
    }

    private async getOwnedRoomOrThrow(
        tx: Prisma.TransactionClient,
        userId: string,
        studioId: string,
        roomId: string,
    ) {
        await this.getOwnedStudioOrThrow(tx, userId, studioId);

        const room = await tx.rehearsal_rooms.findUnique({
            where: {
                room_id: roomId,
            },
            select: {
                room_id: true,
                studio_id: true,
            },
        });

        if (!room) {
            throw new NotFoundException('Sala no encontrada');
        }

        if (room.studio_id !== studioId) {
            throw new BadRequestException(
                'La sala no pertenece al estudio indicado',
            );
        }

        return room;
    }

}

