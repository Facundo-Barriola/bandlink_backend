import {
    BadRequestException,
    ConflictException,
    ForbiddenException,
    Injectable,
    InternalServerErrorException,
    NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import type { Response } from 'express';
import { Resend } from 'resend';
import { Prisma } from 'src/generated/prisma/client';
import { PrismaService } from 'src/prisma/prisma.service';
const MERCADO_PAGO_API_BASE = 'https://api.mercadopago.com';
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

                const existingPendingPayment = await tx.payments.findFirst({
                    where: {
                        booking_id: booking.booking_id,
                        provider: 'mercadopago',
                        status: {
                            in: ['pending', 'in_process', 'authorized'],
                        },
                    },
                    orderBy: {
                        created_at: 'desc',
                    },
                    select: {
                        payment_id: true,
                        mp_preference_id: true,
                        raw_last_response: true,
                        created_at: true,
                    },
                });

                if (existingPendingPayment?.raw_last_response) {
                    const raw = existingPendingPayment.raw_last_response as any;

                    return {
                        payment: existingPendingPayment,
                        preference_id: existingPendingPayment.mp_preference_id,
                        init_point: raw?.init_point ?? null,
                        sandbox_init_point: raw?.sandbox_init_point ?? null,
                        reused: true,
                    };
                }

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

    async getBookingPaymentStatus(userId: string, bookingId: string) {
        try {
            const access = await this.getBookingPaymentAccessContext(userId, bookingId);
            const payment = await this.getLatestPaymentRowByBooking(bookingId);

            const refundSummary = payment
                ? await this.getRefundSummary(payment.payment_id)
                : { total_refunded: 0, refund_count: 0 };

            const totalAmount = payment?.amount
                ? Number(payment.amount)
                : access.booking.total_amount
                    ? Number(access.booking.total_amount.toString())
                    : 0;

            const friendlyStatus = this.mapFriendlyPaymentStatus({
                bookingStatus: access.booking.status ?? null,
                paymentStatus: payment?.status ?? null,
                totalAmount,
                refundedAmount: refundSummary.total_refunded,
            });

            const canRetry =
                ['hold', 'pending_payment'].includes(access.booking.status ?? '') &&
                (!payment ||
                    ['rejected', 'cancelled', 'error'].includes(
                        (payment.status ?? '').toLowerCase(),
                    ));

            const canRefund =
                access.isStudioOwner &&
                !!payment?.mp_payment_id &&
                ['approved', 'refunded'].includes((payment.status ?? '').toLowerCase());

            const canDownloadReceipt =
                !!payment &&
                ['approved', 'refunded'].includes((payment.status ?? '').toLowerCase());

            return {
                booking_id: access.booking.booking_id,
                booking_status: access.booking.status,
                payment_status: payment?.status ?? null,
                payment_status_detail: payment?.status_detail ?? null,
                friendly_status: friendlyStatus,
                amount: totalAmount,
                currency: payment?.currency ?? 'ARS',
                refunded_amount: refundSummary.total_refunded,
                refund_count: refundSummary.refund_count,
                preference_id: payment?.mp_preference_id ?? null,
                mp_payment_id: payment?.mp_payment_id ?? null,
                approved_at: payment?.approved_at ?? null,
                created_at: payment?.created_at ?? null,
                updated_at: payment?.updated_at ?? null,
                can_retry: canRetry,
                can_refund: canRefund,
                can_download_receipt: canDownloadReceipt,
            };
        } catch (error) {
            if (
                error instanceof NotFoundException ||
                error instanceof ForbiddenException
            ) {
                throw error;
            }

            console.error('ERROR GET BOOKING PAYMENT STATUS =>', error);
            throw new InternalServerErrorException(
                'Error al obtener el estado del pago de la reserva',
            );
        }
    }

    async downloadBookingReceipt(
        userId: string,
        bookingId: string,
        res: Response,
    ) {
        try {
            const context = await this.getReceiptContextOrThrow(userId, bookingId);
            const pdfBuffer = this.buildReceiptPdfBuffer(context);

            res.setHeader('Content-Type', 'application/pdf');
            res.setHeader(
                'Content-Disposition',
                `attachment; filename="comprobante-reserva-${bookingId}.pdf"`,
            );
            res.setHeader('Content-Length', pdfBuffer.length);

            res.end(pdfBuffer);
            return res;
        } catch (error) {
            if (
                error instanceof NotFoundException ||
                error instanceof ForbiddenException ||
                error instanceof BadRequestException
            ) {
                throw error;
            }

            console.error('ERROR DOWNLOAD BOOKING RECEIPT =>', error);
            throw new InternalServerErrorException(
                'Error al generar el comprobante de la reserva',
            );
        }
    }

    async refundBookingPayment(
        userId: string,
        bookingId: string,
        dto: { amount?: number; reason?: string },
    ) {
        try {
            const access = await this.getBookingPaymentAccessContext(userId, bookingId);

            if (!access.isStudioOwner) {
                throw new ForbiddenException(
                    'Solo el dueño del estudio puede ejecutar reembolsos manuales',
                );
            }

            const payment = await this.getLatestApprovedPaymentRowByBooking(bookingId);

            if (!payment) {
                throw new NotFoundException(
                    'No se encontró un pago aprobado para esta reserva',
                );
            }

            if (!payment.mp_payment_id) {
                throw new BadRequestException(
                    'El pago no tiene mp_payment_id para procesar el reembolso',
                );
            }

            const totalAmount = payment.amount ? Number(payment.amount) : 0;
            const refundSummary = await this.getRefundSummary(payment.payment_id);
            const alreadyRefunded = refundSummary.total_refunded;
            const refundableAmount = Number((totalAmount - alreadyRefunded).toFixed(2));

            if (refundableAmount <= 0) {
                throw new ConflictException('El pago ya fue reembolsado completamente');
            }

            if (dto.amount !== undefined && dto.amount <= 0) {
                throw new BadRequestException(
                    'El monto del reembolso debe ser mayor a 0',
                );
            }

            const refundAmount = Number(
                (dto.amount ?? refundableAmount).toFixed(2),
            );

            if (refundAmount > refundableAmount) {
                throw new BadRequestException(
                    'El monto solicitado supera el saldo reembolsable del pago',
                );
            }

            const refundResponse = await this.createMercadoPagoRefund(
                payment.mp_payment_id,
                refundAmount,
            );

            const providerRefundId = String(refundResponse?.id ?? '');

            if (!providerRefundId) {
                throw new BadRequestException(
                    'Mercado Pago no devolvió un identificador de reembolso',
                );
            }

            await this.prisma.$executeRaw`
      INSERT INTO payments.refunds (
        refund_id,
        payment_id,
        provider_refund_id,
        amount,
        status,
        created_at,
        updated_at
      )
      VALUES (
        ${randomUUID()}::uuid,
        ${payment.payment_id}::uuid,
        ${providerRefundId},
        ${refundAmount},
        ${String(refundResponse?.status ?? 'approved')},
        NOW(),
        NOW()
      )
    `;

            const totalRefundedAfter = Number(
                (alreadyRefunded + refundAmount).toFixed(2),
            );

            if (totalRefundedAfter >= totalAmount) {
                await this.prisma.$executeRaw`
        UPDATE payments.payments
        SET
          status = 'refunded',
          status_detail = 'fully_refunded',
          updated_at = NOW()
        WHERE payment_id = ${payment.payment_id}::uuid
      `;
            } else {
                await this.prisma.$executeRaw`
        UPDATE payments.payments
        SET
          status_detail = 'partially_refunded',
          updated_at = NOW()
        WHERE payment_id = ${payment.payment_id}::uuid
      `;
            }

            return {
                booking_id: bookingId,
                payment_id: payment.payment_id,
                provider_refund_id: providerRefundId,
                refunded_amount: refundAmount,
                total_refunded: totalRefundedAfter,
                remaining_refundable_amount: Number(
                    (totalAmount - totalRefundedAfter).toFixed(2),
                ),
                status:
                    totalRefundedAfter >= totalAmount
                        ? 'fully_refunded'
                        : 'partially_refunded',
                reason: dto.reason ?? null,
            };
        } catch (error) {
            if (
                error instanceof NotFoundException ||
                error instanceof ForbiddenException ||
                error instanceof BadRequestException ||
                error instanceof ConflictException
            ) {
                throw error;
            }

            console.error('ERROR REFUND BOOKING PAYMENT =>', error);
            throw new InternalServerErrorException(
                'Error al procesar el reembolso del pago',
            );
        }
    }

    private async sendApprovedPaymentEmail(
        bookingId: string,
        paymentId: string,
    ) {
        try {
            const resendApiKey = process.env.RESEND_API_KEY;
            const mailFrom = process.env.MAIL_FROM;
            const frontendUrl = process.env.FRONTEND_URL?.replace(/\/$/, '');

            if (!resendApiKey || !mailFrom || !frontendUrl) {
                console.warn(
                    'MAILER SKIPPED => faltan RESEND_API_KEY, MAIL_FROM o FRONTEND_URL',
                );
                return;
            }

            const context = await this.getReceiptContextByPaymentId(bookingId, paymentId);

            if (!context?.user_email) {
                return;
            }

            const receiptBuffer = this.buildReceiptPdfBuffer(context);
            const resend = new Resend(resendApiKey);

            await resend.emails.send({
                from: mailFrom,
                to: context.user_email,
                subject: `Pago confirmado - Reserva ${context.studio_name}`,
                html: `
        <h2>Pago confirmado</h2>
        <p>Tu pago en BandLink fue aprobado correctamente.</p>
        <p><strong>Estudio:</strong> ${context.studio_name}</p>
        <p><strong>Sala:</strong> ${context.room_name}</p>
        <p><strong>Reserva:</strong> ${this.formatDateRange(
                    context.starts_at,
                    context.ends_at,
                )}</p>
        <p><strong>Importe:</strong> ${this.formatMoney(
                    context.amount,
                    context.currency ?? 'ARS',
                )}</p>
        <p><strong>ID de pago:</strong> ${context.mp_payment_id ?? paymentId}</p>
        <p>También adjuntamos el comprobante en PDF.</p>
        <p>
          <a href="${frontendUrl}/bookings/${bookingId}">
            Ver detalle de la reserva
          </a>
        </p>
      `,
                attachments: [
                    {
                        filename: `comprobante-reserva-${bookingId}.pdf`,
                        content: receiptBuffer.toString('base64'),
                    },
                ],
            });
        } catch (error) {
            console.error('ERROR SEND APPROVED PAYMENT EMAIL =>', error);
        }
    }

    private async createMercadoPagoRefund(
        mercadoPagoPaymentId: string,
        amount?: number,
    ) {
        const accessToken = this.getMercadoPagoAccessToken();

        const response = await fetch(
            `${MERCADO_PAGO_API_BASE}/v1/payments/${mercadoPagoPaymentId}/refunds`,
            {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${accessToken}`,
                    'Content-Type': 'application/json',
                    'X-Idempotency-Key': randomUUID(),
                },
                body:
                    amount !== undefined
                        ? JSON.stringify({ amount })
                        : JSON.stringify({}),
            },
        );

        const responseJson = await response.json();

        if (!response.ok) {
            throw new BadRequestException({
                message: 'Mercado Pago rechazó el reembolso',
                details: responseJson,
            });
        }

        return responseJson;
    }

    private async getBookingPaymentAccessContext(userId: string, bookingId: string) {
        const booking = await this.prisma.bookings.findUnique({
            where: { booking_id: bookingId },
            select: {
                booking_id: true,
                user_id: true,
                status: true,
                total_amount: true,
                starts_at: true,
                ends_at: true,
                created_at: true,
                users: {
                    select: {
                        email: true,
                        username: true,
                        display_name: true,
                    },
                },
                rehearsal_rooms: {
                    select: {
                        room_id: true,
                        name: true,
                        studios: {
                            select: {
                                studio_id: true,
                                name: true,
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
                'No tienes permisos para operar sobre el pago de esta reserva',
            );
        }

        return {
            booking,
            isBookingOwner,
            isStudioOwner,
        };
    }

    private async getLatestPaymentRowByBooking(bookingId: string) {
        return this.prisma.payments.findFirst({
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
    }

    private async getLatestApprovedPaymentRowByBooking(bookingId: string) {
        return this.prisma.payments.findFirst({
            where: {
                booking_id: bookingId,
                status: {
                    in: ['approved', 'refunded'],
                },
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
    }
    private async getRefundSummary(paymentId: string) {
        const result = await this.prisma.refunds.aggregate({
            where: {
                payment_id: paymentId,
            },
            _sum: {
                amount: true,
            },
            _count: {
                _all: true,
            },
        });

        return {
            total_refunded: Number(result._sum.amount ?? 0),
            refund_count: result._count._all ?? 0,
        };
    }

    private mapFriendlyPaymentStatus(input: {
        bookingStatus: string | null;
        paymentStatus: string | null;
        totalAmount: number;
        refundedAmount: number;
    }) {
        const bookingStatus = (input.bookingStatus ?? '').toLowerCase();
        const paymentStatus = (input.paymentStatus ?? '').toLowerCase();

        if (input.refundedAmount > 0 && input.refundedAmount >= input.totalAmount) {
            return 'refunded';
        }

        if (input.refundedAmount > 0) {
            return 'partially_refunded';
        }

        if (paymentStatus === 'approved') {
            return 'paid';
        }

        if (['pending', 'in_process', 'authorized'].includes(paymentStatus)) {
            return 'processing';
        }

        if (['rejected', 'cancelled', 'error'].includes(paymentStatus)) {
            return bookingStatus === 'expired' ? 'expired' : 'retry_available';
        }

        if (bookingStatus === 'expired') {
            return 'expired';
        }

        if (bookingStatus === 'pending_payment') {
            return 'processing';
        }

        if (bookingStatus === 'hold') {
            return 'unpaid';
        }

        return 'unknown';
    }

    private async getReceiptContextOrThrow(userId: string, bookingId: string) {
        await this.getBookingPaymentAccessContext(userId, bookingId);

        const payment = await this.getLatestApprovedPaymentRowByBooking(bookingId);

        if (!payment) {
            throw new NotFoundException(
                'No existe un pago aprobado para generar el comprobante',
            );
        }

        return this.getReceiptContextByPaymentId(bookingId, payment.payment_id);
    }

    private async getReceiptContextByPaymentId(
        bookingId: string,
        paymentId: string,
    ) {
        const booking = await this.prisma.bookings.findUnique({
            where: { booking_id: bookingId },
            select: {
                booking_id: true,
                starts_at: true,
                ends_at: true,
                status: true,
                total_amount: true,
                created_at: true,
                users: {
                    select: {
                        email: true,
                        username: true,
                        display_name: true,
                    },
                },
                rehearsal_rooms: {
                    select: {
                        name: true,
                        studios: {
                            select: {
                                name: true,
                            },
                        },
                    },
                },
            },
        });

        if (!booking) {
            throw new NotFoundException('Reserva no encontrada');
        }

        const payment = await this.prisma.payments.findUnique({
            where: {
                payment_id: paymentId,
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
            throw new NotFoundException('Pago no encontrado');
        }

        return {
            booking_id: booking.booking_id,
            booking_status: booking.status,
            starts_at: booking.starts_at,
            ends_at: booking.ends_at,
            room_name: booking.rehearsal_rooms.name ?? 'Sala de ensayo',
            studio_name: booking.rehearsal_rooms.studios.name ?? 'BandLink',
            user_name:
                booking.users.display_name ||
                booking.users.username ||
                'Usuario',
            user_email: booking.users.email ?? null,
            amount: Number(payment.amount ?? booking.total_amount ?? 0),
            currency: payment.currency ?? 'ARS',
            payment_id: payment.payment_id,
            mp_payment_id: payment.mp_payment_id,
            preference_id: payment.mp_preference_id,
            approved_at: payment.approved_at,
            created_at: payment.created_at,
        };
    }

    private buildReceiptPdfBuffer(input: {
        booking_id: string;
        booking_status: string | null;
        starts_at: Date;
        ends_at: Date;
        room_name: string;
        studio_name: string;
        user_name: string;
        user_email: string | null;
        amount: number;
        currency: string | null;
        payment_id: string;
        mp_payment_id: string | null;
        preference_id: string | null;
        approved_at: Date | null;
        created_at: Date;
    }) {
        const lines = [
            'BandLink - Comprobante de reserva',
            '',
            `Comprobante interno: ${input.payment_id}`,
            `Reserva: ${input.booking_id}`,
            `Estado reserva: ${input.booking_status ?? 'N/A'}`,
            `Estudio: ${input.studio_name}`,
            `Sala: ${input.room_name}`,
            `Usuario: ${input.user_name}`,
            `Email: ${input.user_email ?? 'N/A'}`,
            `Horario: ${this.formatDateRange(input.starts_at, input.ends_at)}`,
            `Importe: ${this.formatMoney(input.amount, input.currency ?? 'ARS')}`,
            `Preference ID: ${input.preference_id ?? 'N/A'}`,
            `MP Payment ID: ${input.mp_payment_id ?? 'N/A'}`,
            `Fecha aprobacion: ${input.approved_at
                ? new Intl.DateTimeFormat('es-AR', {
                    dateStyle: 'short',
                    timeStyle: 'short',
                }).format(input.approved_at)
                : 'N/A'
            }`,
            `Emitido: ${new Intl.DateTimeFormat('es-AR', {
                dateStyle: 'short',
                timeStyle: 'short',
            }).format(new Date())}`,
        ];

        return this.buildSimplePdf(lines);
    }

    private buildSimplePdf(lines: string[]) {
        const sanitizedLines = lines.map((line) =>
            this.pdfEscape(
                line
                    .normalize('NFD')
                    .replace(/[\u0300-\u036f]/g, ''),
            ),
        );

        const textOps = sanitizedLines
            .map((line, index) => {
                const y = 800 - index * 18;
                return `BT /F1 12 Tf 50 ${y} Td (${line}) Tj ET`;
            })
            .join('\n');

        const contentStream = `${textOps}\n`;
        const contentLength = Buffer.byteLength(contentStream, 'utf8');

        const objects = [
            '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n',
            '2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n',
            '3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>\nendobj\n',
            `4 0 obj\n<< /Length ${contentLength} >>\nstream\n${contentStream}endstream\nendobj\n`,
            '5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n',
        ];

        let pdf = '%PDF-1.4\n';
        const offsets: number[] = [];

        for (const obj of objects) {
            offsets.push(Buffer.byteLength(pdf, 'utf8'));
            pdf += obj;
        }

        const xrefOffset = Buffer.byteLength(pdf, 'utf8');

        pdf += `xref
        0 ${objects.length + 1}
        0000000000 65535 f 
        `;

        for (const offset of offsets) {
            pdf += `${String(offset).padStart(10, '0')} 00000 n 
            `;
        }

        pdf += `trailer
        << /Size ${objects.length + 1} /Root 1 0 R >>
        startxref
        ${xrefOffset}
        %%EOF`;

        return Buffer.from(pdf, 'utf8');
    }

    private pdfEscape(text: string) {
        return text
            .replace(/\\/g, '\\\\')
            .replace(/\(/g, '\\(')
            .replace(/\)/g, '\\)');
    }
    private formatMoney(amount: number, currency: string) {
        try {
            return new Intl.NumberFormat('es-AR', {
                style: 'currency',
                currency,
            }).format(amount);
        } catch {
            return `${currency} ${amount.toFixed(2)}`;
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
    private getMercadoPagoAccessToken() {
        const accessToken = process.env.MP_ACCESS_TOKEN;

        if (!accessToken) {
            throw new BadRequestException(
                'Falta configurar MP_ACCESS_TOKEN',
            );
        }

        return accessToken;
    }

    private formatDateRange(startsAt: Date, endsAt: Date) {
        const formatter = new Intl.DateTimeFormat('es-AR', {
            dateStyle: 'short',
            timeStyle: 'short',
        });

        return `${formatter.format(startsAt)} - ${formatter.format(endsAt)}`;
    }
}