import {
    Body,
    Controller,
    Get,
    Param,
    Post,
    Query,
    Req,
    UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { JwtAuthGuard } from 'src/auth/jwt-auth.guard';
import { PaymentsService } from './payments.service';

@Controller('payments')
export class PaymentsController {
    constructor(private readonly paymentsService: PaymentsService) {}

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

    @Post('webhooks/mercadopago')
    receiveMercadoPagoWebhook(
        @Query() query: Record<string, any>,
        @Body() body: Record<string, any>,
    ) {
        return this.paymentsService.processMercadoPagoWebhook(query, body);
    }
}