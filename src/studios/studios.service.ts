import { Injectable, ConflictException, InternalServerErrorException, BadRequestException, NotFoundException, ForbiddenException } from '@nestjs/common';
import { CreateStudioDTO } from './dto/create-studio.dto';
import { UpdateStudioDTO } from './dto/update-studio.dto';
import { UpdateRoomDTO } from './dto/update-room.dto';
import { CreateRoomDTO } from './dto/create-room.dto';
import { SearchStudiosDTO } from './dto/search-studio.dto';
import { PrismaService } from 'src/prisma/prisma.service';
import { Prisma } from '../generated/prisma/client';
import { CreateRoomAvailabilityRuleDTO } from './dto/create-room-availability-rule.dto';
import { UpdateRoomAvailabilityRuleDTO } from './dto/update-room-availability-rule.dto';
import { UpdateRoomEquipmentDTO } from './dto/update-room-equipment.dto';
import { CreateRoomEquipmentDTO } from './dto/create-room-equipment.dto';
import { SearchEquipmentDTO } from './dto/search-equipment.dto';
import { UpdateEquipmentDTO } from './dto/update-equipment.dto';
import { CreateEquipmentDTO } from './dto/create-equipment.dto';
import { UpdateRoomBlockDTO } from './dto/update-room-block.dto';
import { CreateRoomBlockDTO } from './dto/create-room-block.dto';
import { BookingsService } from 'src/bookings/bookings.service';

type TimeInterval = {
    start: Date;
    end: Date;
};

@Injectable()
export class StudiosService {
    constructor(private readonly prisma: PrismaService,
        private readonly bookingService: BookingsService
    ) { }

    async createStudio(userId: string, dto: CreateStudioDTO) {
        try {
            const result = await this.prisma.$transaction(async (tx) => {
                await this.ensurePlaceExists(tx, dto.place_id);

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
                await this.ensurePlaceExists(tx, dto.place_id);

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
                            in: ['pending', 'confirmed'],
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
                            in: ['pending', 'confirmed'],
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

    async createRoomAvailabilityRule(
        userId: string,
        studioId: string,
        roomId: string,
        dto: CreateRoomAvailabilityRuleDTO,
    ) {
        try {
            return await this.prisma.$transaction(async (tx) => {
                await this.getOwnedRoomOrThrow(tx, userId, studioId, roomId);

                const normalized = this.normalizeAvailabilityRuleInput(dto);

                await this.ensureAvailabilityRuleDoesNotConflict(
                    tx,
                    roomId,
                    normalized.day_of_week,
                    normalized.start_time,
                    normalized.end_time,
                );

                const rule = await tx.room_availability_rules.create({
                    data: {
                        room_id: roomId,
                        day_of_week: normalized.day_of_week,
                        start_time: normalized.start_time,
                        end_time: normalized.end_time,
                        timezone: normalized.timezone,
                    },
                    select: {
                        rule_id: true,
                        room_id: true,
                        day_of_week: true,
                        start_time: true,
                        end_time: true,
                        timezone: true,
                        created_at: true,
                        updated_at: true,
                    },
                });

                return this.serializeAvailabilityRule(rule);
            });
        } catch (error) {
            if (
                error instanceof NotFoundException ||
                error instanceof ForbiddenException ||
                error instanceof BadRequestException ||
                error instanceof ConflictException
            ) {
                throw error;
            }

            console.error('ERROR CREATE ROOM AVAILABILITY RULE =>', error);
            throw new InternalServerErrorException(
                'Error al crear la regla de disponibilidad',
            );
        }
    }

    async getRoomAvailabilityRules(studioId: string, roomId: string) {
        const room = await this.prisma.rehearsal_rooms.findUnique({
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

        const rules = await this.prisma.room_availability_rules.findMany({
            where: {
                room_id: roomId,
            },
            select: {
                rule_id: true,
                room_id: true,
                day_of_week: true,
                start_time: true,
                end_time: true,
                timezone: true,
                created_at: true,
                updated_at: true,
            },
            orderBy: [
                {
                    day_of_week: 'asc',
                },
                {
                    start_time: 'asc',
                },
            ],
        });

        return rules.map((rule) => this.serializeAvailabilityRule(rule));
    }

    async updateRoomAvailabilityRule(
        userId: string,
        studioId: string,
        roomId: string,
        ruleId: string,
        dto: UpdateRoomAvailabilityRuleDTO,
    ) {
        try {
            return await this.prisma.$transaction(async (tx) => {
                await this.getOwnedRoomOrThrow(tx, userId, studioId, roomId);

                const existingRule = await this.getRoomAvailabilityRuleOrThrow(
                    tx,
                    roomId,
                    ruleId,
                );

                const normalized = this.normalizeAvailabilityRuleInput({
                    day_of_week: dto.day_of_week ?? existingRule.day_of_week ?? undefined,
                    start_time:
                        dto.start_time ?? this.formatTimeValue(existingRule.start_time) ?? undefined,
                    end_time:
                        dto.end_time ?? this.formatTimeValue(existingRule.end_time) ?? undefined,
                    timezone: dto.timezone ?? existingRule.timezone ?? undefined,
                });

                await this.ensureAvailabilityRuleDoesNotConflict(
                    tx,
                    roomId,
                    normalized.day_of_week,
                    normalized.start_time,
                    normalized.end_time,
                    ruleId,
                );

                const rule = await tx.room_availability_rules.update({
                    where: {
                        rule_id: ruleId,
                    },
                    data: {
                        day_of_week: normalized.day_of_week,
                        start_time: normalized.start_time,
                        end_time: normalized.end_time,
                        timezone: normalized.timezone,
                        updated_at: new Date(),
                    },
                    select: {
                        rule_id: true,
                        room_id: true,
                        day_of_week: true,
                        start_time: true,
                        end_time: true,
                        timezone: true,
                        created_at: true,
                        updated_at: true,
                    },
                });

                return this.serializeAvailabilityRule(rule);
            });
        } catch (error) {
            if (
                error instanceof NotFoundException ||
                error instanceof ForbiddenException ||
                error instanceof BadRequestException ||
                error instanceof ConflictException
            ) {
                throw error;
            }

            console.error('ERROR UPDATE ROOM AVAILABILITY RULE =>', error);
            throw new InternalServerErrorException(
                'Error al actualizar la regla de disponibilidad',
            );
        }
    }

    async deleteRoomAvailabilityRule(
        userId: string,
        studioId: string,
        roomId: string,
        ruleId: string,
    ) {
        try {
            return await this.prisma.$transaction(async (tx) => {
                await this.getOwnedRoomOrThrow(tx, userId, studioId, roomId);
                await this.getRoomAvailabilityRuleOrThrow(tx, roomId, ruleId);

                await tx.room_availability_rules.delete({
                    where: {
                        rule_id: ruleId,
                    },
                });

                return {
                    message: 'Regla de disponibilidad eliminada correctamente',
                    rule_id: ruleId,
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

            console.error('ERROR DELETE ROOM AVAILABILITY RULE =>', error);
            throw new InternalServerErrorException(
                'Error al eliminar la regla de disponibilidad',
            );
        }
    }

    async getEquipmentCatalog(query: SearchEquipmentDTO) {
        return this.prisma.equipment.findMany({
            where: {
                ...(query.q && {
                    name: {
                        contains: query.q.trim(),
                        mode: 'insensitive',
                    },
                }),
                ...(query.category && {
                    category: {
                        contains: query.category.trim(),
                        mode: 'insensitive',
                    },
                }),
            },
            select: {
                equipment_id: true,
                name: true,
                category: true,
                created_at: true,
            },
            orderBy: [
                { category: 'asc' },
                { name: 'asc' },
            ],
            take: query.limit ?? 20,
            skip: query.offset ?? 0,
        });
    }

    async addRoomEquipment(
        userId: string,
        studioId: string,
        roomId: string,
        dto: CreateRoomEquipmentDTO,
    ) {
        try {
            return await this.prisma.$transaction(async (tx) => {
                await this.getOwnedRoomOrThrow(tx, userId, studioId, roomId);
                await this.ensureEquipmentExists(tx, dto.equipment_id);

                const existing = await tx.room_equipment.findFirst({
                    where: {
                        room_id: roomId,
                        equipment_id: dto.equipment_id,
                    },
                    select: {
                        room_equipment_id: true,
                    },
                });

                if (existing) {
                    throw new ConflictException(
                        'Ese equipamiento ya fue agregado a la sala',
                    );
                }

                const item = await tx.room_equipment.create({
                    data: {
                        room_id: roomId,
                        equipment_id: dto.equipment_id,
                        quantity: dto.quantity ?? null,
                    },
                    select: {
                        room_equipment_id: true,
                        room_id: true,
                        equipment_id: true,
                        quantity: true,
                        created_at: true,
                        equipment: {
                            select: {
                                equipment_id: true,
                                name: true,
                                category: true,
                            },
                        },
                    },
                });

                return item;
            });
        } catch (error) {
            if (
                error instanceof NotFoundException ||
                error instanceof ForbiddenException ||
                error instanceof BadRequestException ||
                error instanceof ConflictException
            ) {
                throw error;
            }

            console.error('ERROR ADD ROOM EQUIPMENT =>', error);
            throw new InternalServerErrorException(
                'Error al agregar equipamiento a la sala',
            );
        }
    }

    async getRoomEquipment(studioId: string, roomId: string) {
        const room = await this.prisma.rehearsal_rooms.findUnique({
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

        return this.prisma.room_equipment.findMany({
            where: {
                room_id: roomId,
            },
            select: {
                room_equipment_id: true,
                room_id: true,
                equipment_id: true,
                quantity: true,
                created_at: true,
                equipment: {
                    select: {
                        equipment_id: true,
                        name: true,
                        category: true,
                    },
                },
            },
            orderBy: [
                {
                    equipment: {
                        category: 'asc',
                    },
                },
                {
                    equipment: {
                        name: 'asc',
                    },
                },
            ],
        });
    }

    async updateRoomEquipment(
        userId: string,
        studioId: string,
        roomId: string,
        equipmentId: string,
        dto: UpdateRoomEquipmentDTO,
    ) {
        try {
            return await this.prisma.$transaction(async (tx) => {
                await this.getOwnedRoomOrThrow(tx, userId, studioId, roomId);

                const existing = await this.getRoomEquipmentOrThrow(
                    tx,
                    roomId,
                    equipmentId,
                );

                return tx.room_equipment.update({
                    where: {
                        room_equipment_id: existing.room_equipment_id,
                    },
                    data: {
                        ...(dto.quantity !== undefined && { quantity: dto.quantity }),
                    },
                    select: {
                        room_equipment_id: true,
                        room_id: true,
                        equipment_id: true,
                        quantity: true,
                        created_at: true,
                        equipment: {
                            select: {
                                equipment_id: true,
                                name: true,
                                category: true,
                            },
                        },
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

            console.error('ERROR UPDATE ROOM EQUIPMENT =>', error);
            throw new InternalServerErrorException(
                'Error al actualizar el equipamiento de la sala',
            );
        }
    }

    async deleteRoomEquipment(
        userId: string,
        studioId: string,
        roomId: string,
        equipmentId: string,
    ) {
        try {
            return await this.prisma.$transaction(async (tx) => {
                await this.getOwnedRoomOrThrow(tx, userId, studioId, roomId);

                const existing = await this.getRoomEquipmentOrThrow(
                    tx,
                    roomId,
                    equipmentId,
                );

                await tx.room_equipment.delete({
                    where: {
                        room_equipment_id: existing.room_equipment_id,
                    },
                });

                return {
                    message: 'Equipamiento eliminado correctamente de la sala',
                    room_equipment_id: existing.room_equipment_id,
                    equipment_id: equipmentId,
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

            console.error('ERROR DELETE ROOM EQUIPMENT =>', error);
            throw new InternalServerErrorException(
                'Error al eliminar el equipamiento de la sala',
            );
        }
    }

    async getEquipment(query: SearchEquipmentDTO) {
        return this.prisma.equipment.findMany({
            where: {
                ...(query.q && {
                    name: {
                        contains: query.q.trim(),
                        mode: 'insensitive',
                    },
                }),
                ...(query.category && {
                    category: {
                        contains: query.category.trim(),
                        mode: 'insensitive',
                    },
                }),
            },
            select: {
                equipment_id: true,
                name: true,
                category: true,
                created_at: true,
                _count: {
                    select: {
                        room_equipment: true,
                    },
                },
            },
            orderBy: [
                {
                    category: 'asc',
                },
                {
                    name: 'asc',
                },
            ],
            take: query.limit ?? 20,
            skip: query.offset ?? 0,
        });
    }

    async getEquipmentById(equipmentId: string) {
        const equipment = await this.prisma.equipment.findUnique({
            where: {
                equipment_id: equipmentId,
            },
            select: {
                equipment_id: true,
                name: true,
                category: true,
                created_at: true,
                room_equipment: {
                    select: {
                        room_equipment_id: true,
                        room_id: true,
                        quantity: true,
                        rehearsal_rooms: {
                            select: {
                                room_id: true,
                                studio_id: true,
                                name: true,
                            },
                        },
                    },
                    take: 20,
                    orderBy: {
                        created_at: 'desc',
                    },
                },
                _count: {
                    select: {
                        room_equipment: true,
                    },
                },
            },
        });

        if (!equipment) {
            throw new NotFoundException('Equipamiento no encontrado');
        }

        return equipment;
    }

    async createEquipment(dto: CreateEquipmentDTO) {
        try {
            const normalized = this.normalizeEquipmentInput(dto);

            await this.ensureEquipmentNameNotExists(
                normalized.name,
                normalized.category,
            );

            return await this.prisma.equipment.create({
                data: {
                    name: normalized.name,
                    category: normalized.category,
                },
                select: {
                    equipment_id: true,
                    name: true,
                    category: true,
                    created_at: true,
                },
            });
        } catch (error) {
            if (
                error instanceof BadRequestException ||
                error instanceof ConflictException
            ) {
                throw error;
            }

            console.error('ERROR CREATE EQUIPMENT =>', error);
            throw new InternalServerErrorException(
                'Error al crear el equipamiento',
            );
        }
    }

    async updateEquipment(equipmentId: string, dto: UpdateEquipmentDTO) {
        try {
            const existing = await this.prisma.equipment.findUnique({
                where: {
                    equipment_id: equipmentId,
                },
                select: {
                    equipment_id: true,
                    name: true,
                    category: true,
                },
            });

            if (!existing) {
                throw new NotFoundException('Equipamiento no encontrado');
            }

            const normalized = this.normalizeEquipmentInput({
                name: dto.name ?? existing.name,
                category: dto.category ?? existing.category ?? undefined,
            });

            await this.ensureEquipmentNameNotExists(
                normalized.name,
                normalized.category,
                equipmentId,
            );

            return await this.prisma.equipment.update({
                where: {
                    equipment_id: equipmentId,
                },
                data: {
                    name: normalized.name,
                    category: normalized.category,
                },
                select: {
                    equipment_id: true,
                    name: true,
                    category: true,
                    created_at: true,
                },
            });
        } catch (error) {
            if (
                error instanceof NotFoundException ||
                error instanceof BadRequestException ||
                error instanceof ConflictException
            ) {
                throw error;
            }

            console.error('ERROR UPDATE EQUIPMENT =>', error);
            throw new InternalServerErrorException(
                'Error al actualizar el equipamiento',
            );
        }
    }

    async deleteEquipment(equipmentId: string) {
        try {
            const existing = await this.prisma.equipment.findUnique({
                where: {
                    equipment_id: equipmentId,
                },
                select: {
                    equipment_id: true,
                },
            });

            if (!existing) {
                throw new NotFoundException('Equipamiento no encontrado');
            }

            await this.prisma.equipment.delete({
                where: {
                    equipment_id: equipmentId,
                },
            });

            return {
                message: 'Equipamiento eliminado correctamente',
                equipment_id: equipmentId,
            };
        } catch (error) {
            if (error instanceof NotFoundException) {
                throw error;
            }

            console.error('ERROR DELETE EQUIPMENT =>', error);
            throw new InternalServerErrorException(
                'Error al eliminar el equipamiento',
            );
        }
    }

    async getRoomAvailability(roomId: string, date: string, durationMinutes = 60,
        slotStepMinutes = 60) {
            await this.bookingService.expireOldHolds(10);

        const room = await this.prisma.rehearsal_rooms.findUnique({
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

        if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
            throw new BadRequestException('Fecha inválida. Use YYYY-MM-DD');
        }
        const dayStart = new Date(`${date}T00:00:00.000Z`);
        const dayEnd = new Date(`${date}T23:59:59.999Z`);

        if (isNaN(dayStart.getTime())) {
            throw new BadRequestException('Fecha inválida');
        }

        const dayOfWeek = dayStart.getUTCDay();

        const availabilityRules = await this.prisma.room_availability_rules.findMany({
            where: {
                room_id: roomId,
                day_of_week: dayOfWeek,
            },
            orderBy: {
                start_time: 'asc',
            },
            select: {
                rule_id: true,
                day_of_week: true,
                start_time: true,
                end_time: true,
                timezone: true,
            },
        });

        if (!availabilityRules.length) {
            return {
                room_id: roomId,
                date,
                slots: [],
            };
        }

        const blocks = await this.prisma.room_blocks.findMany({
            where: {
                room_id: roomId,
                starts_at: { lt: dayEnd },
                ends_at: { gt: dayStart },
            },
            select: {
                block_id: true,
                starts_at: true,
                ends_at: true,
                reason: true,
            },
            orderBy: {
                starts_at: 'asc',
            }
        });

        const bookings = await this.prisma.bookings.findMany({
            where: {
                room_id: roomId,
                starts_at: { lt: dayEnd },
                ends_at: { gt: dayStart },
                status: {
                    in: ['hold', 'pending_payment', 'confirmed'],
                },
            },
            select: {
                booking_id: true,
                starts_at: true,
                ends_at: true,
                status: true,
            },
            orderBy: {
                starts_at: 'asc',
            }
        });

        const validRules = availabilityRules.filter(
            (rule): rule is typeof rule & { start_time: Date; end_time: Date } =>
                rule.start_time !== null && rule.end_time !== null,
        );

        const ruleIntervals: TimeInterval[] = validRules.map((rule) => ({
            start: this.combineDateAndTimeUtc(date, rule.start_time),
            end: this.combineDateAndTimeUtc(date, rule.end_time),
        }));

        const busyIntervals: TimeInterval[] = [
            ...blocks
                .filter((b) => b.starts_at && b.ends_at)
                .map((b) => ({
                    start: b.starts_at as Date,
                    end: b.ends_at as Date,
                })),
            ...bookings
                .filter((b) => b.starts_at && b.ends_at)
                .map((b) => ({
                    start: b.starts_at as Date,
                    end: b.ends_at as Date,
                })),
        ];

        const mergedBusy = this.mergeIntervals(busyIntervals);

        const freeIntervals = ruleIntervals.flatMap((ruleInterval) =>
            this.subtractIntervals(ruleInterval, mergedBusy),
        );


        const slots = this.generateSlots(freeIntervals, durationMinutes, slotStepMinutes);

        return {
            room_id: roomId,
            date,
            slots,
        };

    }
    async createRoomBlock(
        userId: string,
        studioId: string,
        roomId: string,
        dto: CreateRoomBlockDTO,
    ) {
        try {
            return await this.prisma.$transaction(async (tx) => {
                await this.getOwnedRoomOrThrow(tx, userId, studioId, roomId);

                const normalized = this.normalizeRoomBlockInput({
                    starts_at: dto.starts_at,
                    ends_at: dto.ends_at,
                    reason: dto.reason,
                });

                await this.ensureRoomBlockDoesNotConflict(
                    tx,
                    roomId,
                    normalized.starts_at,
                    normalized.ends_at,
                );

                const block = await tx.room_blocks.create({
                    data: {
                        room_id: roomId,
                        starts_at: normalized.starts_at,
                        ends_at: normalized.ends_at,
                        reason: normalized.reason,
                        created_by: userId,
                    },
                    select: {
                        block_id: true,
                        room_id: true,
                        starts_at: true,
                        ends_at: true,
                        reason: true,
                        created_by: true,
                        created_at: true,
                    },
                });

                return block;
            });
        } catch (error) {
            if (
                error instanceof NotFoundException ||
                error instanceof ForbiddenException ||
                error instanceof BadRequestException ||
                error instanceof ConflictException
            ) {
                throw error;
            }

            console.error('ERROR CREATE ROOM BLOCK =>', error);
            throw new InternalServerErrorException(
                'Error al crear el bloqueo de la sala',
            );
        }
    }

    async getRoomBlocks(
        userId: string,
        studioId: string,
        roomId: string,
    ) {
        await this.prisma.$transaction(async (tx) => {
            await this.getOwnedRoomOrThrow(tx, userId, studioId, roomId);
        });

        return this.prisma.room_blocks.findMany({
            where: {
                room_id: roomId,
            },
            select: {
                block_id: true,
                room_id: true,
                starts_at: true,
                ends_at: true,
                reason: true,
                created_by: true,
                created_at: true,
            },
            orderBy: {
                starts_at: 'asc',
            },
        });
    }

    async getRoomBlockById(
        userId: string,
        studioId: string,
        roomId: string,
        blockId: string,
    ) {
        return this.prisma.$transaction(async (tx) => {
            await this.getOwnedRoomOrThrow(tx, userId, studioId, roomId);
            return this.getRoomBlockOrThrow(tx, roomId, blockId);
        });
    }

    async updateRoomBlock(
        userId: string,
        studioId: string,
        roomId: string,
        blockId: string,
        dto: UpdateRoomBlockDTO,
    ) {
        try {
            return await this.prisma.$transaction(async (tx) => {
                await this.getOwnedRoomOrThrow(tx, userId, studioId, roomId);

                const existingBlock = await this.getRoomBlockOrThrow(
                    tx,
                    roomId,
                    blockId,
                );

                const normalized = this.normalizeRoomBlockInput({
                    starts_at: dto.starts_at ?? existingBlock.starts_at,
                    ends_at: dto.ends_at ?? existingBlock.ends_at,
                    reason: dto.reason ?? existingBlock.reason ?? undefined,
                });

                await this.ensureRoomBlockDoesNotConflict(
                    tx,
                    roomId,
                    normalized.starts_at,
                    normalized.ends_at,
                    blockId,
                );

                const block = await tx.room_blocks.update({
                    where: {
                        block_id: blockId,
                    },
                    data: {
                        starts_at: normalized.starts_at,
                        ends_at: normalized.ends_at,
                        reason: normalized.reason,
                    },
                    select: {
                        block_id: true,
                        room_id: true,
                        starts_at: true,
                        ends_at: true,
                        reason: true,
                        created_by: true,
                        created_at: true,
                    },
                });

                return block;
            });
        } catch (error) {
            if (
                error instanceof NotFoundException ||
                error instanceof ForbiddenException ||
                error instanceof BadRequestException ||
                error instanceof ConflictException
            ) {
                throw error;
            }

            console.error('ERROR UPDATE ROOM BLOCK =>', error);
            throw new InternalServerErrorException(
                'Error al actualizar el bloqueo de la sala',
            );
        }
    }

    async deleteRoomBlock(
        userId: string,
        studioId: string,
        roomId: string,
        blockId: string,
    ) {
        try {
            return await this.prisma.$transaction(async (tx) => {
                await this.getOwnedRoomOrThrow(tx, userId, studioId, roomId);
                await this.getRoomBlockOrThrow(tx, roomId, blockId);

                await tx.room_blocks.delete({
                    where: {
                        block_id: blockId,
                    },
                });

                return {
                    message: 'Bloqueo eliminado correctamente',
                    block_id: blockId,
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

            console.error('ERROR DELETE ROOM BLOCK =>', error);
            throw new InternalServerErrorException(
                'Error al eliminar el bloqueo de la sala',
            );
        }
    }

    private async getRoomBlockOrThrow(
        tx: Prisma.TransactionClient,
        roomId: string,
        blockId: string,
    ) {
        const block = await tx.room_blocks.findUnique({
            where: {
                block_id: blockId,
            },
            select: {
                block_id: true,
                room_id: true,
                starts_at: true,
                ends_at: true,
                reason: true,
                created_by: true,
                created_at: true,
            },
        });

        if (!block) {
            throw new NotFoundException('Bloqueo no encontrado');
        }

        if (block.room_id !== roomId) {
            throw new BadRequestException(
                'El bloqueo no pertenece a la sala indicada',
            );
        }

        return block;
    }

    private normalizeRoomBlockInput(input: {
        starts_at?: Date;
        ends_at?: Date;
        reason?: string;
    }) {
        if (!input.starts_at || !input.ends_at) {
            throw new BadRequestException(
                'Debes indicar fecha y hora de inicio y fin',
            );
        }

        const startsAt = new Date(input.starts_at);
        const endsAt = new Date(input.ends_at);

        if (isNaN(startsAt.getTime()) || isNaN(endsAt.getTime())) {
            throw new BadRequestException('Las fechas del bloqueo son inválidas');
        }

        if (startsAt.getTime() >= endsAt.getTime()) {
            throw new BadRequestException(
                'La fecha/hora de inicio debe ser menor a la de fin',
            );
        }

        return {
            starts_at: startsAt,
            ends_at: endsAt,
            reason: input.reason?.trim() || null,
        };
    }

    private async ensureRoomBlockDoesNotConflict(
        tx: Prisma.TransactionClient,
        roomId: string,
        startsAt: Date,
        endsAt: Date,
        ignoreBlockId?: string,
    ) {
        const overlappingBlock = await tx.room_blocks.findFirst({
            where: {
                room_id: roomId,
                starts_at: {
                    lt: endsAt,
                },
                ends_at: {
                    gt: startsAt,
                },
                ...(ignoreBlockId && {
                    NOT: {
                        block_id: ignoreBlockId,
                    },
                }),
            },
            select: {
                block_id: true,
            },
        });

        if (overlappingBlock) {
            throw new ConflictException(
                'El bloqueo se superpone con otro bloqueo existente',
            );
        }

        const overlappingBooking = await tx.bookings.findFirst({
            where: {
                room_id: roomId,
                starts_at: {
                    lt: endsAt,
                },
                ends_at: {
                    gt: startsAt,
                },
                status: {
                    in: ['pending', 'pending_payment', 'confirmed', 'hold'],
                },
            },
            select: {
                booking_id: true,
                status: true,
            },
        });

        if (overlappingBooking) {
            throw new ConflictException(
                'El bloqueo se superpone con una reserva activa',
            );
        }
    }

    private combineDateAndTimeUtc(date: string, timeValue: string | Date): Date {
        const time = this.normalizeTimeValue(timeValue);
        return new Date(`${date}T${time}.000Z`);
    }

    private normalizeTimeValue(timeValue: string | Date): string {
        if (typeof timeValue === 'string') {
            return timeValue.slice(0, 8);
        }

        const hh = String(timeValue.getUTCHours()).padStart(2, '0');
        const mm = String(timeValue.getUTCMinutes()).padStart(2, '0');
        const ss = String(timeValue.getUTCSeconds()).padStart(2, '0');

        return `${hh}:${mm}:${ss}`;
    }

    private mergeIntervals(intervals: TimeInterval[]): TimeInterval[] {
        if (!intervals.length) return [];

        const sorted = [...intervals].sort(
            (a, b) => a.start.getTime() - b.start.getTime(),
        );

        const merged: TimeInterval[] = [sorted[0]];

        for (let i = 1; i < sorted.length; i++) {
            const current = sorted[i];
            const last = merged[merged.length - 1];

            if (current.start.getTime() <= last.end.getTime()) {
                if (current.end.getTime() > last.end.getTime()) {
                    last.end = current.end;
                }
            } else {
                merged.push({ ...current });
            }
        }

        return merged;
    }

    private subtractIntervals(
        baseInterval: TimeInterval,
        busyIntervals: TimeInterval[],
    ): TimeInterval[] {
        let free: TimeInterval[] = [{ ...baseInterval }];

        for (const busy of busyIntervals) {
            const nextFree: TimeInterval[] = [];

            for (const current of free) {
                const noOverlap =
                    busy.end.getTime() <= current.start.getTime() ||
                    busy.start.getTime() >= current.end.getTime();

                if (noOverlap) {
                    nextFree.push(current);
                    continue;
                }

                if (busy.start.getTime() > current.start.getTime()) {
                    nextFree.push({
                        start: current.start,
                        end: busy.start,
                    });
                }

                if (busy.end.getTime() < current.end.getTime()) {
                    nextFree.push({
                        start: busy.end,
                        end: current.end,
                    });
                }
            }

            free = nextFree;
            if (!free.length) break;
        }

        return free.filter((i) => i.end.getTime() > i.start.getTime());
    }

    private generateSlots(
        freeIntervals: TimeInterval[],
        durationMinutes: number,
        slotStepMinutes: number,
    ) {
        const slots: Array<{ starts_at: string; ends_at: string }> = [];
        const durationMs = durationMinutes * 60 * 1000;
        const stepMs = slotStepMinutes * 60 * 1000;

        for (const interval of freeIntervals) {
            let cursor = interval.start.getTime();
            const intervalEnd = interval.end.getTime();

            while (cursor + durationMs <= intervalEnd) {
                const slotStart = new Date(cursor);
                const slotEnd = new Date(cursor + durationMs);

                slots.push({
                    starts_at: slotStart.toISOString(),
                    ends_at: slotEnd.toISOString(),
                });

                cursor += stepMs;
            }
        }

        return slots;
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

    private async ensurePlaceExists(
        tx: Prisma.TransactionClient,
        placeId?: string | null,
    ) {
        if (!placeId) {
            return;
        }

        const place = await tx.places.findUnique({
            where: {
                place_id: placeId,
            },
            select: {
                place_id: true,
            },
        });

        if (!place) {
            throw new BadRequestException('La ubicación seleccionada no existe');
        }
    }

    private async getRoomAvailabilityRuleOrThrow(
        tx: Prisma.TransactionClient,
        roomId: string,
        ruleId: string,
    ) {
        const rule = await tx.room_availability_rules.findUnique({
            where: {
                rule_id: ruleId,
            },
            select: {
                rule_id: true,
                room_id: true,
                day_of_week: true,
                start_time: true,
                end_time: true,
                timezone: true,
                created_at: true,
                updated_at: true,
            },
        });

        if (!rule) {
            throw new NotFoundException('Regla de disponibilidad no encontrada');
        }

        if (rule.room_id !== roomId) {
            throw new BadRequestException(
                'La regla de disponibilidad no pertenece a la sala indicada',
            );
        }

        return rule;
    }

    private normalizeAvailabilityRuleInput(input: {
        day_of_week?: number | null;
        start_time?: string;
        end_time?: string;
        timezone?: string | null;
    }) {
        if (input.day_of_week === undefined || input.day_of_week === null) {
            throw new BadRequestException('Debes indicar el día de la semana');
        }

        if (!input.start_time || !input.end_time) {
            throw new BadRequestException(
                'Debes indicar hora de inicio y de fin',
            );
        }

        const timezone = input.timezone?.trim();

        if (!timezone) {
            throw new BadRequestException('Debes indicar la zona horaria');
        }

        const startMinutes = this.timeStringToMinutes(input.start_time);
        const endMinutes = this.timeStringToMinutes(input.end_time);

        if (startMinutes >= endMinutes) {
            throw new BadRequestException(
                'La hora de inicio debe ser menor a la hora de fin',
            );
        }

        return {
            day_of_week: input.day_of_week,
            start_time: this.timeStringToDate(input.start_time),
            end_time: this.timeStringToDate(input.end_time),
            timezone,
        };
    }

    private async ensureAvailabilityRuleDoesNotConflict(
        tx: Prisma.TransactionClient,
        roomId: string,
        dayOfWeek: number,
        startTime: Date,
        endTime: Date,
        ignoreRuleId?: string,
    ) {
        const existingRules = await tx.room_availability_rules.findMany({
            where: {
                room_id: roomId,
                day_of_week: dayOfWeek,
                ...(ignoreRuleId && {
                    NOT: {
                        rule_id: ignoreRuleId,
                    },
                }),
            },
            select: {
                rule_id: true,
                start_time: true,
                end_time: true,
            },
        });

        const newStart = this.timeValueToMinutes(startTime);
        const newEnd = this.timeValueToMinutes(endTime);

        const hasConflict = existingRules.some((rule) => {
            const currentStart = this.timeValueToMinutes(rule.start_time);
            const currentEnd = this.timeValueToMinutes(rule.end_time);

            return newStart < currentEnd && newEnd > currentStart;
        });

        if (hasConflict) {
            throw new ConflictException(
                'La regla se superpone con otra disponibilidad existente',
            );
        }
    }

    private serializeAvailabilityRule(rule: {
        rule_id: string;
        room_id: string;
        day_of_week: number | null;
        start_time: Date | null;
        end_time: Date | null;
        timezone: string | null;
        created_at: Date;
        updated_at: Date | null;
    }) {
        return {
            rule_id: rule.rule_id,
            room_id: rule.room_id,
            day_of_week: rule.day_of_week,
            start_time: this.formatTimeValue(rule.start_time),
            end_time: this.formatTimeValue(rule.end_time),
            timezone: rule.timezone,
            created_at: rule.created_at,
            updated_at: rule.updated_at,
        };
    }

    private timeStringToDate(value: string) {
        const normalized = value.length === 5 ? `${value}:00` : value;
        return new Date(`1970-01-01T${normalized}.000Z`);
    }

    private timeStringToMinutes(value: string) {
        const [hours, minutes] = value.split(':').map(Number);
        return hours * 60 + minutes;
    }

    private timeValueToMinutes(value: Date | null) {
        if (!value) {
            throw new BadRequestException('La hora de la regla es inválida');
        }

        return value.getUTCHours() * 60 + value.getUTCMinutes();
    }

    private formatTimeValue(value: Date | null) {
        if (!value) {
            return null;
        }

        const hours = String(value.getUTCHours()).padStart(2, '0');
        const minutes = String(value.getUTCMinutes()).padStart(2, '0');
        const seconds = String(value.getUTCSeconds()).padStart(2, '0');

        return `${hours}:${minutes}:${seconds}`;
    }

    private async ensureEquipmentExists(
        tx: Prisma.TransactionClient,
        equipmentId: string,
    ) {
        const equipment = await tx.equipment.findUnique({
            where: {
                equipment_id: equipmentId,
            },
            select: {
                equipment_id: true,
            },
        });

        if (!equipment) {
            throw new NotFoundException('Equipamiento no encontrado');
        }

        return equipment;
    }

    private async getRoomEquipmentOrThrow(
        tx: Prisma.TransactionClient,
        roomId: string,
        equipmentId: string,
    ) {
        const item = await tx.room_equipment.findFirst({
            where: {
                room_id: roomId,
                equipment_id: equipmentId,
            },
            select: {
                room_equipment_id: true,
                room_id: true,
                equipment_id: true,
                quantity: true,
            },
        });

        if (!item) {
            throw new NotFoundException(
                'Ese equipamiento no está asociado a la sala',
            );
        }

        return item;
    }

    private normalizeEquipmentInput(input: {
        name?: string;
        category?: string | null;
    }) {
        const name = input.name?.trim();
        const category = input.category?.trim() || null;

        if (!name) {
            throw new BadRequestException('Debes indicar el nombre del equipamiento');
        }

        return {
            name,
            category,
        };
    }

    private async ensureEquipmentNameNotExists(
        name: string,
        category?: string | null,
        ignoreEquipmentId?: string,
    ) {
        const existing = await this.prisma.equipment.findFirst({
            where: {
                name: {
                    equals: name,
                    mode: 'insensitive',
                },
                ...(category
                    ? {
                        category: {
                            equals: category,
                            mode: 'insensitive',
                        },
                    }
                    : {
                        category: null,
                    }),
                ...(ignoreEquipmentId && {
                    NOT: {
                        equipment_id: ignoreEquipmentId,
                    },
                }),
            },
            select: {
                equipment_id: true,
            },
        });

        if (existing) {
            throw new ConflictException(
                'Ya existe un equipamiento con ese nombre y categoría',
            );
        }
    }

}

