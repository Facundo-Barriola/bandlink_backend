import {
    BadRequestException,
    ForbiddenException,
    Injectable,
    InternalServerErrorException,
    NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { Prisma } from 'src/generated/prisma/client';
import { PrismaService } from 'src/prisma/prisma.service';

@Injectable()
export class PaymentsService {
    constructor(private readonly prisma: PrismaService) { }

    async createCheckoutProPreference(userId: string, bookingId: string) {
        try {
            return await this.prisma.$transaction(async (tx) => {
                const booking = await tx.bookings.findUnique({
                    where: {
                        booking_id: bookingId,
                    },
                    select: {
                        booking_id: true,
                        user_id: true,
                        status: true,
                        total_amount: true,
                        created_at: true,
                        starts_at: true,
                        ends_at: true,
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
                                email: true,
                                display_name: true,
                                username: true,
                            },
                        },
                    },
                });

                if (!booking) {
                    throw new NotFoundException('Reserva no encontrada');
                }

                if (booking.user_id !== userId) {
                    throw new ForbiddenException(
                        'No tienes permisos para pagar esta reserva',
                    );
                }

                if (
                    booking.status === 'cancelled_by_user' ||
                    booking.status === 'cancelled_by_studio' ||
                    booking.status === 'expired'
                ) {
                    throw new BadRequestException(
                        'No se puede pagar una reserva cancelada o expirada',
                    );
                }

                if (booking.status === 'confirmed') {
                    throw new BadRequestException(
                        'La reserva ya está confirmada',
                    );
                }

                if (booking.status !== 'hold' && booking.status !== 'pending_payment') {
                    throw new BadRequestException(
                        'La reserva no está en un estado válido para iniciar el pago',
                    );
                }

                if (!this.isHoldStillActive(booking.created_at) && booking.status === 'hold') {
                    await tx.bookings.update({
                        where: {
                            booking_id: booking.booking_id,
                        },
                        data: {
                            status: 'expired',
                            updated_at: new Date(),
                        },
                    });

                    await tx.booking_status_history.create({
                        data: {
                            booking_id: booking.booking_id,
                            status: 'expired',
                            changed_at: new Date(),
                            changed_by: userId,
                            note: 'El hold expiró antes de generar la preference de pago',
                        },
                    });

                    throw new BadRequestException(
                        'El hold de la reserva expiró. Debes generar uno nuevo',
                    );
                }

                if (!booking.total_amount || Number(booking.total_amount) <= 0) {
                    throw new BadRequestException(
                        'La reserva no tiene un importe válido para cobrar',
                    );
                }

                const backendUrl = this.getRequiredEnv(
                    'BACKEND_PUBLIC_URL',
                    'Falta configurar BACKEND_PUBLIC_URL',
                );
                const frontendUrl = this.getRequiredEnv(
                    'FRONTEND_URL',
                    'Falta configurar FRONTEND_URL',
                );

                const amount = Number(booking.total_amount);
                const externalReference = `booking:${booking.booking_id}`;

                const preferenceResponse = await this.createMercadoPagoPreference({
                    external_reference: externalReference,
                    notification_url: `${backendUrl}/payments/webhooks/mercadopago`,
                    payer: {
                        email: booking.users.email,
                        name:
                            booking.users.display_name ||
                            booking.users.username ||
                            undefined,
                    },
                    items: [
                        {
                            id: booking.booking_id,
                            title: `Reserva ${booking.rehearsal_rooms.studios.name} - ${booking.rehearsal_rooms.name}`,
                            description: `Reserva de sala de ensayo desde ${booking.starts_at.toISOString()} hasta ${booking.ends_at.toISOString()}`,
                            quantity: 1,
                            currency_id: 'ARS',
                            unit_price: amount,
                        },
                    ],
                    back_urls: {
                        success: `${frontendUrl}/bookings/${booking.booking_id}/payment/success`,
                        pending: `${frontendUrl}/bookings/${booking.booking_id}/payment/pending`,
                        failure: `${frontendUrl}/bookings/${booking.booking_id}/payment/failure`,
                    },
                    auto_return: 'approved',
                });

                const payment = await tx.payments.create({
                    data: {
                        booking_id: booking.booking_id,
                        provider: 'mercadopago',
                        amount: new Prisma.Decimal(amount),
                        currency: 'ARS',
                        status: 'pending',
                        status_detail: 'preference_created',
                        mp_preference_id: preferenceResponse.id ?? null,
                        mp_payment_id: '',
                        mp_merchant_order_id: '',
                        external_reference: externalReference,
                        raw_last_response: preferenceResponse,
                        updated_at: new Date(),
                    },
                    select: {
                        payment_id: true,
                        booking_id: true,
                        provider: true,
                        amount: true,
                        currency: true,
                        status: true,
                        status_detail: true,
                        mp_preference_id: true,
                        mp_payment_id: true,
                        mp_merchant_order_id: true,
                        external_reference: true,
                        created_at: true,
                        updated_at: true,
                        approved_at: true,
                    },
                });

                if (booking.status !== 'pending_payment') {
                    await tx.bookings.update({
                        where: {
                            booking_id: booking.booking_id,
                        },
                        data: {
                            status: 'pending_payment',
                            updated_at: new Date(),
                        },
                    });

                    await tx.booking_status_history.create({
                        data: {
                            booking_id: booking.booking_id,
                            status: 'pending_payment',
                            changed_at: new Date(),
                            changed_by: userId,
                            note: 'Se inició el checkout con Mercado Pago',
                        },
                    });
                }

                return {
                    payment,
                    preference_id: preferenceResponse.id ?? null,
                    init_point: preferenceResponse.init_point ?? null,
                    sandbox_init_point: preferenceResponse.sandbox_init_point ?? null,
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

            console.error('ERROR CREATE MERCADO PAGO PREFERENCE =>', error);
            throw new InternalServerErrorException(
                'Error al generar la preference de Mercado Pago',
            );
        }
    }

    async getLatestBookingPayment(userId: string, bookingId: string) {
        try {
            const booking = await this.prisma.bookings.findUnique({
                where: {
                    booking_id: bookingId,
                },
                select: {
                    booking_id: true,
                    user_id: true,
                    rehearsal_rooms: {
                        select: {
                            studios: {
                                select: {
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

            const isBookingOwner = booking.user_id === userId;
            const isStudioOwner =
                booking.rehearsal_rooms.studios.owner_user_id === userId;

            if (!isBookingOwner && !isStudioOwner) {
                throw new ForbiddenException(
                    'No tienes permisos para ver los pagos de esta reserva',
                );
            }

            const payment = await this.prisma.payments.findFirst({
                where: {
                    booking_id: bookingId,
                },
                orderBy: {
                    created_at: 'desc',
                },
                select: {
                    payment_id: true,
                    booking_id: true,
                    provider: true,
                    amount: true,
                    currency: true,
                    status: true,
                    status_detail: true,
                    mp_preference_id: true,
                    mp_payment_id: true,
                    mp_merchant_order_id: true,
                    external_reference: true,
                    raw_last_response: true,
                    created_at: true,
                    updated_at: true,
                    approved_at: true,
                },
            });

            if (!payment) {
                throw new NotFoundException(
                    'No se encontraron pagos para esta reserva',
                );
            }

            return payment;
        } catch (error) {
            if (
                error instanceof NotFoundException ||
                error instanceof ForbiddenException
            ) {
                throw error;
            }

            console.error('ERROR GET LATEST BOOKING PAYMENT =>', error);
            throw new InternalServerErrorException(
                'Error al obtener el último pago de la reserva',
            );
        }
    }

    async processMercadoPagoWebhook(
        query: Record<string, any>,
        body: Record<string, any>,
    ) {
        try {
            const paymentProviderId =
                body?.data?.id ??
                body?.id ??
                query?.['data.id'] ??
                query?.data_id ??
                query?.id;

            if (!paymentProviderId) {
                return {
                    received: true,
                    ignored: true,
                    reason: 'Webhook sin payment id',
                };
            }

            const providerPayment = await this.getMercadoPagoPayment(
                String(paymentProviderId),
            );

            const preferenceId = providerPayment?.order?.id
                ? null
                : providerPayment?.preference_id ?? null;

            const externalReference =
                providerPayment?.external_reference ?? null;

            const internalPayment = await this.prisma.payments.findFirst({
                where: {
                    OR: [
                        ...(providerPayment?.preference_id
                            ? [
                                {
                                    mp_preference_id:
                                        providerPayment.preference_id,
                                },
                            ]
                            : []),
                        ...(externalReference
                            ? [
                                {
                                    external_reference: externalReference,
                                },
                            ]
                            : []),
                    ],
                    provider: 'mercadopago',
                },
                orderBy: {
                    created_at: 'desc',
                },
                select: {
                    payment_id: true,
                    booking_id: true,
                    status: true,
                    bookings: {
                        select: {
                            booking_id: true,
                            user_id: true,
                            status: true,
                            created_at: true,
                        },
                    },
                },
            });

            if (!internalPayment) {
                return {
                    received: true,
                    ignored: true,
                    reason: 'No se encontró el pago interno asociado',
                    provider_payment_id: String(paymentProviderId),
                };
            }

            await this.prisma.$transaction(async (tx) => {
                await tx.payment_webhooks.create({
                    data: {
                        webhook_id: String(body?.id ?? paymentProviderId),
                        payment_id: internalPayment.payment_id,
                        provider: 'mercadopago',
                        event_type:
                            body?.type ??
                            query?.type ??
                            query?.topic ??
                            'payment',
                        payload: {
                            query,
                            body,
                            provider_payment: providerPayment,
                            provider_payment_id: String(paymentProviderId),
                        },
                        received_at: new Date(),
                        processed_at: new Date(),
                        processing_error: null,
                    },
                });

                await tx.payments.update({
                    where: {
                        payment_id: internalPayment.payment_id,
                    },
                    data: {
                        status: providerPayment?.status ?? 'unknown',
                        status_detail:
                            providerPayment?.status_detail ?? null,
                        mp_payment_id: String(providerPayment?.id ?? paymentProviderId),
                        mp_preference_id:
                            providerPayment?.preference_id ?? null,
                        ...(providerPayment?.order?.id
                            ? { mp_merchant_order_id: String(providerPayment.order.id) }
                            : {}),
                        raw_last_response: providerPayment,
                        approved_at:
                            providerPayment?.status === 'approved'
                                ? new Date()
                                : null,
                        updated_at: new Date(),
                    },
                });

                if (
                    providerPayment?.status === 'approved' &&
                    internalPayment.bookings.status !== 'confirmed'
                ) {
                    await tx.bookings.update({
                        where: {
                            booking_id: internalPayment.booking_id,
                        },
                        data: {
                            status: 'confirmed',
                            updated_at: new Date(),
                        },
                    });

                    await tx.booking_status_history.create({
                        data: {
                            booking_id: internalPayment.booking_id,
                            status: 'confirmed',
                            changed_at: new Date(),
                            changed_by: internalPayment.bookings.user_id,
                            note: 'Reserva confirmada automáticamente por pago aprobado en Mercado Pago',
                        },
                    });
                }

                if (
                    ['rejected', 'cancelled'].includes(
                        providerPayment?.status ?? '',
                    ) &&
                    internalPayment.bookings.status === 'pending_payment'
                ) {
                    const nextBookingStatus = this.isHoldStillActive(
                        internalPayment.bookings.created_at,
                    )
                        ? 'hold'
                        : 'expired';

                    await tx.bookings.update({
                        where: {
                            booking_id: internalPayment.booking_id,
                        },
                        data: {
                            status: nextBookingStatus,
                            updated_at: new Date(),
                        },
                    });

                    await tx.booking_status_history.create({
                        data: {
                            booking_id: internalPayment.booking_id,
                            status: nextBookingStatus,
                            changed_at: new Date(),
                            changed_by: internalPayment.bookings.user_id,
                            note: `Estado actualizado por webhook de Mercado Pago: ${providerPayment?.status ?? 'unknown'}`,
                        },
                    });
                }
            });

            return {
                received: true,
                processed: true,
                provider_payment_id: String(paymentProviderId),
            };
        } catch (error) {
            console.error('ERROR PROCESS MERCADO PAGO WEBHOOK =>', error);

            return {
                received: true,
                processed: false,
                error:
                    error instanceof Error
                        ? error.message
                        : 'unknown_error',
            };
        }
    }

    private async createMercadoPagoPreference(body: Record<string, any>) {
        const accessToken = this.getRequiredEnv(
            'MP_ACCESS_TOKEN',
            'Falta configurar MP_ACCESS_TOKEN',
        );

        const response = await fetch(
            'https://api.mercadopago.com/checkout/preferences',
            {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${accessToken}`,
                    'Content-Type': 'application/json',
                    'X-Idempotency-Key': randomUUID(),
                },
                body: JSON.stringify(body),
            },
        );

        const data = await response.json();

        if (!response.ok) {
            throw new BadRequestException(
                data?.message ||
                'Mercado Pago rechazó la creación de la preference',
            );
        }

        return data;
    }

    private async getMercadoPagoPayment(paymentId: string) {
        const accessToken = this.getRequiredEnv(
            'MP_ACCESS_TOKEN',
            'Falta configurar MP_ACCESS_TOKEN',
        );

        const response = await fetch(
            `https://api.mercadopago.com/v1/payments/${paymentId}`,
            {
                method: 'GET',
                headers: {
                    Authorization: `Bearer ${accessToken}`,
                    'Content-Type': 'application/json',
                },
            },
        );

        const data = await response.json();

        if (!response.ok) {
            throw new BadRequestException(
                data?.message ||
                'No se pudo consultar el pago en Mercado Pago',
            );
        }

        return data;
    }

    private getRequiredEnv(name: string, message: string) {
        const value = process.env[name];

        if (!value) {
            throw new BadRequestException(message);
        }

        return value;
    }

    private isHoldStillActive(createdAt: Date, ttlMinutes = 10) {
        const expiresAt = new Date(createdAt.getTime() + ttlMinutes * 60 * 1000);
        return expiresAt.getTime() > Date.now();
    }
}