import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from 'src/prisma/prisma.service';
import { CreateEventDTO } from './dto/create-event.dto';
import { UpdateEventDTO } from './dto/update-event.dto';
import { CancelEventDTO } from './dto/cancel-event.dto';
import { SearchEventsDTO } from './dto/search-events.dto';
import { NotificationsService } from 'src/notifications/notifications.service';

@Injectable()
export class EventsService {
  constructor(private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
  ) {}

  async createEvent(userId: string, dto: CreateEventDTO) {
    try {
      return await this.prisma.$transaction(async (tx) => {
        await this.ensureDatesAreValid(dto.starts_at, dto.ends_at);
        await this.ensurePlaceExists(tx, dto.place_id);
        await this.ensureUserExists(tx, userId);

        if (dto.host_band_id) {
          await this.ensureBandMembership(tx, userId, dto.host_band_id);
        }

        return tx.events.create({
          data: {
            host_user_id: userId,
            host_band_id: dto.host_band_id ?? null,
            title: dto.title,
            description: dto.description ?? null,
            starts_at: dto.starts_at ?? null,
            ends_at: dto.ends_at ?? null,
            timezone: dto.timezone ?? null,
            capacity: dto.capacity ?? null,
            visibility: dto.visibility ?? 'public',
            place_id: dto.place_id ?? null,
          },
          select: this.eventSelect(),
        });
      });
    } catch (error) {
      if (
        error instanceof BadRequestException ||
        error instanceof NotFoundException ||
        error instanceof ForbiddenException
      ) {
        throw error;
      }

      console.error('ERROR CREATE EVENT =>', error);
      throw new InternalServerErrorException('Error al crear el evento');
    }
  }

  async updateEvent(userId: string, eventId: string, dto: UpdateEventDTO) {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const event = await this.getOwnedEventOrThrow(tx, userId, eventId);

        if (event.is_cancelled) {
          throw new BadRequestException('No puedes editar un evento cancelado');
        }

        const nextStartsAt = dto.starts_at ?? event.starts_at ?? undefined;
        const nextEndsAt = dto.ends_at ?? event.ends_at ?? undefined;

        await this.ensureDatesAreValid(nextStartsAt, nextEndsAt);
        await this.ensurePlaceExists(tx, dto.place_id);

        if (dto.host_band_id !== undefined) {
          if (dto.host_band_id) {
            await this.ensureBandMembership(tx, userId, dto.host_band_id);
          }
        }

        return tx.events.update({
          where: {
            event_id: eventId,
          },
          data: {
            ...(dto.host_band_id !== undefined && {
              host_band_id: dto.host_band_id,
            }),
            ...(dto.title !== undefined && { title: dto.title }),
            ...(dto.description !== undefined && {
              description: dto.description,
            }),
            ...(dto.starts_at !== undefined && { starts_at: dto.starts_at }),
            ...(dto.ends_at !== undefined && { ends_at: dto.ends_at }),
            ...(dto.timezone !== undefined && { timezone: dto.timezone }),
            ...(dto.capacity !== undefined && { capacity: dto.capacity }),
            ...(dto.visibility !== undefined && { visibility: dto.visibility }),
            ...(dto.place_id !== undefined && { place_id: dto.place_id }),
            updated_at: new Date(),
          },
          select: this.eventSelect(),
        });
      });
    } catch (error) {
      if (
        error instanceof BadRequestException ||
        error instanceof NotFoundException ||
        error instanceof ForbiddenException
      ) {
        throw error;
      }

      console.error('ERROR UPDATE EVENT =>', error);
      throw new InternalServerErrorException(
        'Error al actualizar la información del evento',
      );
    }
  }

  async cancelEvent(userId: string, eventId: string, dto: CancelEventDTO) {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const event = await this.getOwnedEventOrThrow(tx, userId, eventId);

        if (event.is_cancelled) {
          throw new BadRequestException('El evento ya se encuentra cancelado');
        }

        const cancelledEvent = await tx.events.update({
          where: {
            event_id: eventId,
          },
          data: {
            is_cancelled: true,
            cancel_reason: dto.cancel_reason ?? null,
            updated_at: new Date(),
          },
          select: this.eventSelect(),
        });

        const attendees = await this.prisma.event_attendees.findMany({
          where: { event_id: eventId, status: { not: 'declined' } },
          select: { user_id: true },
        });

        await Promise.allSettled(
          attendees.map((a) =>
            this.notificationsService.createNotification(
              a.user_id,
              'event_cancelled',
              { event_id: eventId },
            ),
          ),
        );

        return {
          message: 'Evento cancelado correctamente',
          event: cancelledEvent,
        };
      });



    } catch (error) {
      if (
        error instanceof BadRequestException ||
        error instanceof NotFoundException ||
        error instanceof ForbiddenException
      ) {
        throw error;
      }

      console.error('ERROR CANCEL EVENT =>', error);
      throw new InternalServerErrorException('Error al cancelar el evento');
    }
  }

  async searchEventsByName(userId: string, query: SearchEventsDTO) {
    const search = query.name.trim();

    if (!search) {
      throw new BadRequestException('Debes enviar un nombre para buscar eventos');
    }

    return this.prisma.events.findMany({
      where: {
        is_cancelled: false,
        title: {
          contains: search,
          mode: 'insensitive',
        },
        OR: [
          {
            visibility: 'public',
          },
          {
            visibility: null,
          },
          {
            host_user_id: userId,
          },
        ],
      },
      select: this.eventSelect(),
      orderBy: [
        {
          starts_at: 'asc',
        },
        {
          created_at: 'desc',
        },
      ],
      take: query.limit ?? 20,
      skip: query.offset ?? 0,
    });
  }

  private eventSelect() {
    return {
      event_id: true,
      host_user_id: true,
      host_band_id: true,
      title: true,
      description: true,
      starts_at: true,
      ends_at: true,
      timezone: true,
      capacity: true,
      visibility: true,
      place_id: true,
      is_cancelled: true,
      cancel_reason: true,
      created_at: true,
      updated_at: true,
      users: {
        select: {
          user_id: true,
          username: true,
          display_name: true,
        },
      },
      bands: {
        select: {
          band_id: true,
          name: true,
          description: true,
        },
      },
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
          event_attendees: true,
          event_invites: true,
          event_media: true,
        },
      },
    } satisfies Prisma.eventsSelect;
  }

  private async ensureDatesAreValid(
    startsAt?: Date | null,
    endsAt?: Date | null,
  ) {
    if (startsAt && endsAt && endsAt <= startsAt) {
      throw new BadRequestException(
        'La fecha de fin debe ser posterior a la fecha de inicio',
      );
    }
  }

  private async ensurePlaceExists(
    tx: Prisma.TransactionClient,
    placeId?: string,
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
      throw new NotFoundException('Lugar no encontrado');
    }
  }

  private async ensureUserExists(
    tx: Prisma.TransactionClient,
    userId: string,
  ) {
    const user = await tx.users.findUnique({
      where: {
        user_id: userId,
      },
      select: {
        user_id: true,
        is_active: true,
      },
    });

    if (!user || user.is_active === false) {
      throw new NotFoundException('Usuario no encontrado');
    }
  }

  private async ensureBandMembership(
    tx: Prisma.TransactionClient,
    userId: string,
    bandId: string,
  ) {
    const membership = await tx.band_members.findFirst({
      where: {
        band_id: bandId,
        user_id: userId,
        status: 'ACTIVE',
        left_at: null,
      },
      select: {
        band_member_id: true,
      },
    });

    if (!membership) {
      throw new ForbiddenException(
        'No tienes permisos para publicar eventos en nombre de esta banda',
      );
    }
  }

  private async getOwnedEventOrThrow(
    tx: Prisma.TransactionClient,
    userId: string,
    eventId: string,
  ) {
    const event = await tx.events.findUnique({
      where: {
        event_id: eventId,
      },
      select: {
        event_id: true,
        host_user_id: true,
        host_band_id: true,
        starts_at: true,
        ends_at: true,
        is_cancelled: true,
      },
    });

    if (!event) {
      throw new NotFoundException('Evento no encontrado');
    }

    if (event.host_user_id !== userId) {
      throw new ForbiddenException(
        'No tienes permisos para administrar este evento',
      );
    }

    return event;
  }
}