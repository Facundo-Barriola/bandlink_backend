import {
    Body,
    Controller,
    Get,
    Param,
    Patch,
    Post,
    Query,
    Req,
    UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from 'src/auth/jwt-auth.guard';
import { Request } from 'express';
import { CreateBookingHoldDTO } from './dto/create-booking-hold.dto';
import { CancelBookingDTO } from './dto/cancel-booking.dto';
import { BookingsService } from './bookings.service';
import { GetMyActiveBookingsDTO } from './dto/get-my-active-bookings.dto';
import { GetStudioBookingHistoryDTO } from './dto/get-studio-booking-history.dto';

@Controller("bookings")
export class BookingsController {

    constructor(private readonly bookingsService: BookingsService) { }

    @Post('hold')
    @UseGuards(JwtAuthGuard)
    createBookingHold(
        @Req() req: Request & { user: any },
        @Body() dto: CreateBookingHoldDTO,
    ) {
        return this.bookingsService.createBookingHold(
            req.user.userId,
            dto.room_id,
            dto,
        );
    }

    @Post(':bookingId/confirm')
    @UseGuards(JwtAuthGuard)
    confirmBooking(
        @Req() req: Request & { user: any },
        @Param('bookingId') bookingId: string,
    ) {
        return this.bookingsService.confirmBooking(
            req.user.userId,
            bookingId,
        );
    }

    @Post(':bookingId/cancel')
    @UseGuards(JwtAuthGuard)
    cancelBooking(
        @Req() req: Request & { user: any },
        @Param('studioId') studioId: string,
        @Param('bookingId') bookingId: string,
        @Body() dto: CancelBookingDTO,
    ) {
        return this.bookingsService.cancelBooking(
            req.user.userId,
            bookingId,
            dto.reason,
        );
    }

    @Get('studios/:studioId/history')
    @UseGuards(JwtAuthGuard)
    getStudioBookingHistory(
        @Req() req: Request & { user: any },
        @Param('studioId') studioId: string,
        @Query() query: GetStudioBookingHistoryDTO,
    ) {
        return this.bookingsService.getStudioBookingHistory(
            req.user.userId,
            studioId,
            query,
        );
    }

    @Get('me/active')
    @UseGuards(JwtAuthGuard)
    getMyActiveBookings(
        @Req() req: Request & { user: any },
        @Query() query: GetMyActiveBookingsDTO,
    ) {
        return this.bookingsService.getMyActiveBookings(
            req.user.userId,
            query.limit,
        );
    }

    @Get('studios/:studioId/active')
    @UseGuards(JwtAuthGuard)
    getStudioActiveBookings(
        @Req() req: Request & { user: any },
        @Param('studioId') studioId: string,
    ) {
        return this.bookingsService.getStudioActiveBookings(
            req.user.userId,
            studioId,
        );
    }

    @Get(':bookingId')
    @UseGuards(JwtAuthGuard)
    getBookingById(
        @Req() req: Request & { user: any },
        @Param('bookingId') bookingId: string,
    ) {
        return this.bookingsService.getBookingById(
            req.user.userId,
            bookingId,
        );
    }
}