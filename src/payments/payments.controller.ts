import {
    Body,
    Controller,
    Get,
    Param,
    Post,
    Query,
    Req,
    Res,
    UseGuards,
} from '@nestjs/common';
import type { Request, Response as ExpressResponse } from 'express';
import { JwtAuthGuard } from 'src/auth/jwt-auth.guard';
import { PaymentsService } from './payments.service';
import {CreateRefundDTO} from "./dto/create-refund.dto";

@Controller('payments')
export class PaymentsController {
    constructor(private readonly paymentsService: PaymentsService) { }

    @Post('bookings/:bookingId/checkout-pro')
    @UseGuards(JwtAuthGuard)
    createCheckoutProPreference(
        @Req() req: Request & { user: any },
        @Param('bookingId') bookingId: string,
    ) {
        return this.paymentsService.createCheckoutProPreference(
            req.user.userId,
            bookingId,
        );
    }

    @Get('bookings/:bookingId/latest')
    @UseGuards(JwtAuthGuard)
    getLatestBookingPayment(
        @Req() req: Request & { user: any },
        @Param('bookingId') bookingId: string,
    ) {
        return this.paymentsService.getLatestBookingPayment(
            req.user.userId,
            bookingId,
        );
    }

    @Get('bookings/:bookingId/status')
    @UseGuards(JwtAuthGuard)
    getBookingPaymentStatus(
        @Req() req: Request & { user: any },
        @Param('bookingId') bookingId: string,
    ) {
        return this.paymentsService.getBookingPaymentStatus(
            req.user.userId,
            bookingId,
        );
    }

    @Get('bookings/:bookingId/receipt')
    @UseGuards(JwtAuthGuard)
    downloadBookingReceipt(
        @Req() req: Request & { user: any },
        @Param('bookingId') bookingId: string,
        @Res() res: ExpressResponse,
    ) {
        return this.paymentsService.downloadBookingReceipt(
            req.user.userId,
            bookingId,
            res,
        );
    }

    @Post('bookings/:bookingId/refund')
    @UseGuards(JwtAuthGuard)
    refundBookingPayment(
        @Req() req: Request & { user: any },
        @Param('bookingId') bookingId: string,
        @Body() dto: CreateRefundDTO,
        
    ) {
        return this.paymentsService.refundBookingPayment(
            req.user.userId,
            bookingId,
            dto,
        );
    }

    @Post('webhooks/mercadopago')
    receiveMercadoPagoWebhook(
        @Query() query: Record<string, any>,
        @Body() body: Record<string, any>,
    ) {
        return this.paymentsService.processMercadoPagoWebhook(query, body);
    }
}