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
import { Request } from 'express';
import { JwtAuthGuard } from 'src/auth/jwt-auth.guard';
import { EventsService } from './events.service';
import { CreateEventDTO } from './dto/create-event.dto';
import { UpdateEventDTO } from './dto/update-event.dto';
import { CancelEventDTO } from './dto/cancel-event.dto';
import { SearchEventsDTO } from './dto/search-events.dto';

@Controller('events')
export class EventsController {
  constructor(private readonly eventsService: EventsService) {}

  @Post()
  @UseGuards(JwtAuthGuard)
  createEvent(
    @Req() req: Request & { user: any },
    @Body() dto: CreateEventDTO,
  ) {
    return this.eventsService.createEvent(req.user.userId, dto);
  }

  @Patch(':eventId')
  @UseGuards(JwtAuthGuard)
  updateEvent(
    @Req() req: Request & { user: any },
    @Param('eventId') eventId: string,
    @Body() dto: UpdateEventDTO,
  ) {
    return this.eventsService.updateEvent(req.user.userId, eventId, dto);
  }

  @Patch(':eventId/cancel')
  @UseGuards(JwtAuthGuard)
  cancelEvent(
    @Req() req: Request & { user: any },
    @Param('eventId') eventId: string,
    @Body() dto: CancelEventDTO,
  ) {
    return this.eventsService.cancelEvent(req.user.userId, eventId, dto);
  }

  @Get('search')
  @UseGuards(JwtAuthGuard)
  searchEventsByName(
    @Req() req: Request & { user: any },
    @Query() query: SearchEventsDTO,
  ) {
    return this.eventsService.searchEventsByName(req.user.userId, query);
  }
}