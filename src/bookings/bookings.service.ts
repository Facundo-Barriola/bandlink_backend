import {
    BadRequestException,
    ForbiddenException,
    Injectable,
    InternalServerErrorException,
    NotFoundException,
    ConflictException
} from "@nestjs/common";
import { PrismaService } from "src/prisma/prisma.service";
import { CreateBookingHoldDTO } from "./dto/create-booking-hold.dto";
import { Prisma, rehearsal_rooms } from "src/generated/prisma/client";
import { GetStudioBookingHistoryDTO } from "./dto/get-studio-booking-history.dto";

@Injectable()
export class BookingsService {
    constructor(private readonly prisma: PrismaService) { }

    async createBookingHold(
        userId: string,
        roomId: string,
        dto: CreateBookingHoldDTO,
    ) {
        try {
            return await this.prisma.$transaction(async (tx) => {
                await this.ensureMusicianProfileExists(tx, userId);

                const room = await tx.rehearsal_rooms.findUnique({
                    where: {
                        room_id: roomId,
                    },
                    select: {
                        room_id: true,
                        studio_id: true,
                        is_active: true,
                        min_booking_minutes: true,
                        base_hourly_price: true,
                    },
                });

                if (!room) {
                    throw new NotFoundException('Sala no encontrada');
                }

                if (!room.is_active) {
                    throw new BadRequestException('La sala no está activa');
                }

                const normalized = this.normalizeBookingWindowInput({
                    starts_at: dto.starts_at,
                    ends_at: dto.ends_at,
                    notes: dto.notes,
                });

                if (
                    room.min_booking_minutes &&
                    normalized.duration_minutes < room.min_booking_minutes
                ) {
                    throw new BadRequestException(
                        `La duración mínima de reserva para esta sala es de ${room.min_booking_minutes} minutos`,
                    );
                }

                if (!room.base_hourly_price) {
                    throw new BadRequestException(
                        'La sala no tiene un precio por hora configurado',
                    );
                }

                await this.ensureBookingWindowAvailable(
                    tx,
                    roomId,
                    normalized.starts_at,
                    normalized.ends_at,
                );

                const totalAmount = this.calculateBookingAmount(
                    room.base_hourly_price,
                    normalized.duration_minutes,
                );

                const booking = await tx.bookings.create({
                    data: {
                        room_id: roomId,
                        user_id: userId,
                        starts_at: normalized.starts_at,
                        ends_at: normalized.ends_at,
                        status: 'hold',
                        total_amount: totalAmount,
                        notes: normalized.notes,
                    },
                    select: {
                        booking_id: true,
                        room_id: true,
                        user_id: true,
                        starts_at: true,
                        ends_at: true,
                        status: true,
                        total_amount: true,
                        notes: true,
                        cancelled_at: true,
                        cancellation_reasons: true,
                        created_at: true,
                        updated_at: true,
                    },
                });

                await tx.booking_status_history.create({
                    data: {
                        booking_id: booking.booking_id,
                        status: 'hold',
                        changed_at: new Date(),
                        changed_by: userId,
                        note: 'Hold creado',
                    },
                });

                return booking;
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

            console.error('ERROR CREATE BOOKING HOLD =>', error);
            throw new InternalServerErrorException(
                'Error al crear el hold de la reserva',
            );
        }
    }


    async confirmBooking(
        userId: string,
        bookingId: string,
    ) {
        try {
            return await this.prisma.$transaction(async (tx) => {
                const booking = await this.getBookingOrThrow(tx, bookingId);

                if (booking.user_id !== userId) {
                    throw new ForbiddenException(
                        'No tienes permisos para confirmar esta reserva',
                    );
                }

                if (booking.status !== 'hold') {
                    throw new BadRequestException(
                        'Solo se pueden confirmar reservas en estado hold',
                    );
                }

                if (!this.isHoldStillActive(booking.created_at)) {
                    await tx.bookings.update({
                        where: {
                            booking_id: bookingId,
                        },
                        data: {
                            status: 'expired',
                            updated_at: new Date(),
                        },
                    });

                    await tx.booking_status_history.create({
                        data: {
                            booking_id: bookingId,
                            status: 'expired',
                            changed_at: new Date(),
                            changed_by: userId,
                            note: 'El hold expiró antes de confirmar',
                        },
                    });

                    throw new ConflictException(
                        'El hold de la reserva expiró. Debes generar uno nuevo',
                    );
                }

                await this.ensureBookingWindowAvailable(
                    tx,
                    booking.room_id,
                    booking.starts_at,
                    booking.ends_at,
                    booking.booking_id,
                );

                const updated = await tx.bookings.update({
                    where: {
                        booking_id: bookingId,
                    },
                    data: {
                        status: 'confirmed',
                        updated_at: new Date(),
                    },
                    select: {
                        booking_id: true,
                        room_id: true,
                        user_id: true,
                        starts_at: true,
                        ends_at: true,
                        status: true,
                        total_amount: true,
                        notes: true,
                        cancelled_at: true,
                        cancellation_reasons: true,
                        created_at: true,
                        updated_at: true,
                    },
                });

                await tx.booking_status_history.create({
                    data: {
                        booking_id: bookingId,
                        status: 'confirmed',
                        changed_at: new Date(),
                        changed_by: userId,
                        note: 'Reserva confirmada',
                    },
                });

                return updated;
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

            console.error('ERROR CONFIRM BOOKING =>', error);
            throw new InternalServerErrorException(
                'Error al confirmar la reserva',
            );
        }
    }

    async cancelBooking(
        userId: string,
        bookingId: string,
        reason?: string,
    ) {
        try {
            return await this.prisma.$transaction(async (tx) => {
                const booking = await this.getBookingOrThrow(tx, bookingId);

                const isBookingOwner = booking.user_id === userId;
                const isStudioOwner =
                    booking.rehearsal_rooms.studios.owner_user_id === userId;

                if (!isBookingOwner && !isStudioOwner) {
                    throw new ForbiddenException(
                        'No tienes permisos para cancelar esta reserva',
                    );
                }

                if (
                    booking.status === 'cancelled_by_user' ||
                    booking.status === 'cancelled_by_studio' ||
                    booking.status === 'expired'
                ) {
                    throw new BadRequestException(
                        'La reserva ya no puede cancelarse',
                    );
                }

                const newStatus = isStudioOwner
                    ? 'cancelled_by_studio'
                    : 'cancelled_by_user';

                const updated = await tx.bookings.update({
                    where: {
                        booking_id: bookingId,
                    },
                    data: {
                        status: newStatus,
                        cancelled_at: new Date(),
                        cancellation_reasons: reason?.trim() || null,
                        updated_at: new Date(),
                    },
                    select: {
                        booking_id: true,
                        room_id: true,
                        user_id: true,
                        starts_at: true,
                        ends_at: true,
                        status: true,
                        total_amount: true,
                        notes: true,
                        cancelled_at: true,
                        cancellation_reasons: true,
                        created_at: true,
                        updated_at: true,
                    },
                });

                await tx.booking_status_history.create({
                    data: {
                        booking_id: bookingId,
                        status: newStatus,
                        changed_at: new Date(),
                        changed_by: userId,
                        note: reason?.trim() || 'Reserva cancelada',
                    },
                });

                return updated;
            });
        } catch (error) {
            if (
                error instanceof NotFoundException ||
                error instanceof ForbiddenException ||
                error instanceof BadRequestException
            ) {
                throw error;
            }

            console.error('ERROR CANCEL BOOKING =>', error);
            throw new InternalServerErrorException(
                'Error al cancelar la reserva',
            );
        }
    }

    async getMyActiveBookings(userId: string, limit = 5) {
        try {
            await this.ensureMusicianProfileExists(this.prisma, userId);

            const bookings = await this.prisma.bookings.findMany({
                where: {
                    user_id: userId,
                    ends_at: {
                        gt: new Date(),
                    },
                    status: {
                        in: ['hold', 'pending', 'pending_payment', 'confirmed'],
                    },
                },
                select: {
                    booking_id: true,
                    room_id: true,
                    user_id: true,
                    starts_at: true,
                    ends_at: true,
                    status: true,
                    total_amount: true,
                    notes: true,
                    cancelled_at: true,
                    cancellation_reasons: true,
                    created_at: true,
                    updated_at: true,
                    rehearsal_rooms: {
                        select: {
                            room_id: true,
                            name: true,
                            studio_id: true,
                            studios: {
                                select: {
                                    studio_id: true,
                                    name: true,
                                },
                            },
                        },
                    },
                },
                orderBy: [
                    {
                        starts_at: 'asc',
                    },
                    {
                        created_at: 'desc',
                    },
                ],
                take: limit,
            });

            return {
                user_id: userId,
                total: bookings.length,
                items: bookings,
            };
        } catch (error) {
            if (
                error instanceof NotFoundException ||
                error instanceof ForbiddenException ||
                error instanceof BadRequestException
            ) {
                throw error;
            }

            console.error('ERROR GET MY ACTIVE BOOKINGS =>', error);
            throw new InternalServerErrorException(
                'Error al obtener las reservas activas del músico',
            );
        }
    }

    async getStudioBookingHistory(
        userId: string,
        studioId: string,
        query: GetStudioBookingHistoryDTO,
    ) {
        try {
            return await this.prisma.$transaction(async (tx) => {
                await this.getOwnedStudioOrThrow(tx, userId, studioId);

                if (query.roomId) {
                    await this.ensureRoomBelongsToStudio(tx, studioId, query.roomId);
                }

                let dateFilter: Prisma.bookingsWhereInput = {};

                if (query.date) {
                    const dayStart = new Date(`${query.date}T00:00:00.000Z`);
                    const dayEnd = new Date(`${query.date}T23:59:59.999Z`);

                    if (isNaN(dayStart.getTime())) {
                        throw new BadRequestException('Fecha inválida');
                    }

                    dateFilter = {
                        starts_at: {
                            lt: dayEnd,
                        },
                        ends_at: {
                            gt: dayStart,
                        },
                    };
                }

                const where: Prisma.bookingsWhereInput = {
                    rehearsal_rooms: {
                        studio_id: studioId,
                    },
                    ...(query.roomId && { room_id: query.roomId }),
                    ...dateFilter,
                };

                const bookings = await tx.bookings.findMany({
                    where,
                    select: {
                        booking_id: true,
                        room_id: true,
                        user_id: true,
                        starts_at: true,
                        ends_at: true,
                        status: true,
                        total_amount: true,
                        notes: true,
                        cancelled_at: true,
                        cancellation_reasons: true,
                        created_at: true,
                        updated_at: true,
                        rehearsal_rooms: {
                            select: {
                                room_id: true,
                                name: true,
                                studio_id: true,
                            },
                        },
                        users: {
                            select: {
                                user_id: true,
                                username: true,
                                display_name: true,
                                email: true,
                            },
                        },
                    },
                    orderBy: [
                        {
                            starts_at: 'desc',
                        },
                        {
                            created_at: 'desc',
                        },
                    ],
                });

                return {
                    studio_id: studioId,
                    filters: {
                        room_id: query.roomId ?? null,
                        date: query.date ?? null,
                    },
                    total: bookings.length,
                    items: bookings,
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

            console.error('ERROR GET STUDIO BOOKING HISTORY =>', error);
            throw new InternalServerErrorException(
                'Error al obtener el historial de reservas del estudio',
            );
        }
    }

    async getStudioActiveBookings(userId: string, studioId: string) {
        try {
            return await this.prisma.$transaction(async (tx) => {
                await this.getOwnedStudioOrThrow(tx, userId, studioId);

                const bookings = await tx.bookings.findMany({
                    where: {
                        rehearsal_rooms: {
                            studio_id: studioId,
                        },
                        ends_at: {
                            gt: new Date(),
                        },
                        status: {
                            in: ['hold', 'pending', 'pending_payment', 'confirmed'],
                        },
                    },
                    select: {
                        booking_id: true,
                        room_id: true,
                        user_id: true,
                        starts_at: true,
                        ends_at: true,
                        status: true,
                        total_amount: true,
                        notes: true,
                        cancelled_at: true,
                        cancellation_reasons: true,
                        created_at: true,
                        updated_at: true,
                        rehearsal_rooms: {
                            select: {
                                room_id: true,
                                name: true,
                                studio_id: true,
                            },
                        },
                        users: {
                            select: {
                                user_id: true,
                                username: true,
                                display_name: true,
                                email: true,
                            },
                        },
                    },
                    orderBy: [
                        {
                            starts_at: 'asc',
                        },
                        {
                            created_at: 'desc',
                        },
                    ],
                });

                return {
                    studio_id: studioId,
                    total: bookings.length,
                    items: bookings,
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

            console.error('ERROR GET STUDIO ACTIVE BOOKINGS =>', error);
            throw new InternalServerErrorException(
                'Error al obtener las reservas activas del estudio',
            );
        }
    }

    async getBookingById(userId: string, bookingId: string) {
        try {
            const booking = await this.prisma.bookings.findUnique({
                where: {
                    booking_id: bookingId,
                },
                select: {
                    booking_id: true,
                    room_id: true,
                    user_id: true,
                    starts_at: true,
                    ends_at: true,
                    status: true,
                    total_amount: true,
                    notes: true,
                    cancelled_at: true,
                    cancellation_reasons: true,
                    created_at: true,
                    updated_at: true,
                    rehearsal_rooms: {
                        select: {
                            room_id: true,
                            name: true,
                            studio_id: true,
                            studios: {
                                select: {
                                    studio_id: true,
                                    owner_user_id: true,
                                    name: true,
                                },
                            },
                        },
                    },
                    users: {
                        select: {
                            user_id: true,
                            username: true,
                            display_name: true,
                            email: true,
                        },
                    },
                },
            });

            if (!booking) {
                throw new NotFoundException('Reserva no encontrada');
            }

            const isBookingOwner = booking.user_id === userId;
            const isStudioOwner =
                booking.rehearsal_rooms.studios.owner_user_id === userId;

            if (!isBookingOwner && !isStudioOwner) {
                throw new ForbiddenException(
                    'No tienes permisos para ver esta reserva',
                );
            }

            return booking;
        } catch (error) {
            if (
                error instanceof NotFoundException ||
                error instanceof ForbiddenException ||
                error instanceof BadRequestException
            ) {
                throw error;
            }

            console.error('ERROR GET BOOKING BY ID =>', error);
            throw new InternalServerErrorException(
                'Error al obtener la reserva',
            );
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
    private async ensureRoomBelongsToStudio(
        tx: Prisma.TransactionClient,
        studioId: string,
        roomId: string,
    ) {
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
    private async ensureMusicianProfileExists(
        db: Prisma.TransactionClient | PrismaService,
        userId: string,
    ) {
        const musician = await db.musician_profile.findUnique({
            where: {
                user_id: userId,
            },
            select: {
                musician_id: true,
            },
        });

        if (!musician) {
            throw new ForbiddenException(
                'Solo un usuario con perfil de músico puede reservar salas',
            );
        }

        return musician;
    }

    private normalizeBookingWindowInput(input: {
        starts_at?: Date;
        ends_at?: Date;
        notes?: string;
    }) {
        if (!input.starts_at || !input.ends_at) {
            throw new BadRequestException(
                'Debes indicar fecha y hora de inicio y fin',
            );
        }

        const startsAt = new Date(input.starts_at);
        const endsAt = new Date(input.ends_at);

        if (isNaN(startsAt.getTime()) || isNaN(endsAt.getTime())) {
            throw new BadRequestException('Las fechas de la reserva son inválidas');
        }

        if (startsAt.getTime() >= endsAt.getTime()) {
            throw new BadRequestException(
                'La fecha/hora de inicio debe ser menor a la de fin',
            );
        }

        if (startsAt.getTime() <= Date.now()) {
            throw new BadRequestException(
                'La reserva debe realizarse para una fecha futura',
            );
        }

        const durationMinutes = Math.round(
            (endsAt.getTime() - startsAt.getTime()) / 60000,
        );

        return {
            starts_at: startsAt,
            ends_at: endsAt,
            duration_minutes: durationMinutes,
            notes: input.notes?.trim() || null,
        };
    }

    private calculateBookingAmount(
        hourlyPrice: NonNullable<rehearsal_rooms['base_hourly_price']>,
        durationMinutes: number,
    ) {
        return hourlyPrice.mul(durationMinutes).div(60);
    }

    private async getBookingOrThrow(
        tx: Prisma.TransactionClient,
        bookingId: string,
    ) {
        const booking = await tx.bookings.findUnique({
            where: {
                booking_id: bookingId,
            },
            select: {
                booking_id: true,
                room_id: true,
                user_id: true,
                starts_at: true,
                ends_at: true,
                status: true,
                total_amount: true,
                notes: true,
                cancelled_at: true,
                cancellation_reasons: true,
                created_at: true,
                updated_at: true,
                rehearsal_rooms: {
                    select: {
                        room_id: true,
                        studio_id: true,
                        studios: {
                            select: {
                                studio_id: true,
                                owner_user_id: true,
                            },
                        },
                    },
                },
            },
        });

        if (!booking) {
            throw new NotFoundException('Reserva no encontrada');
        }

        return booking;
    }

    private async ensureBookingWindowAvailable(
        tx: Prisma.TransactionClient,
        roomId: string,
        startsAt: Date,
        endsAt: Date,
        ignoreBookingId?: string,
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
            },
            select: {
                block_id: true,
            },
        });

        if (overlappingBlock) {
            throw new ConflictException(
                'El horario seleccionado está bloqueado para esa sala',
            );
        }

        const holdCutoff = this.getBookingHoldCutoffDate();

        const overlappingBooking = await tx.bookings.findFirst({
            where: {
                room_id: roomId,
                starts_at: {
                    lt: endsAt,
                },
                ends_at: {
                    gt: startsAt,
                },
                ...(ignoreBookingId && {
                    NOT: {
                        booking_id: ignoreBookingId,
                    },
                }),
                OR: [
                    {
                        status: {
                            in: ['pending', 'pending_payment', 'confirmed'],
                        },
                    },
                    {
                        status: 'hold',
                        created_at: {
                            gte: holdCutoff,
                        },
                    },
                ],
            },
            select: {
                booking_id: true,
                status: true,
                created_at: true,
            },
        });

        if (overlappingBooking) {
            throw new ConflictException(
                'El horario seleccionado ya no está disponible',
            );
        }
    }

    private getBookingHoldCutoffDate(ttlMinutes = 10) {
        return new Date(Date.now() - ttlMinutes * 60 * 1000);
    }

    private isHoldStillActive(createdAt: Date, ttlMinutes = 10) {
        const expiresAt = new Date(createdAt.getTime() + ttlMinutes * 60 * 1000);
        return expiresAt.getTime() > Date.now();
    }
}