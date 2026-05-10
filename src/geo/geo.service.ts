import {
  BadRequestException,
  ConflictException,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { Prisma } from '../generated/prisma/client';
import { RedisLocationService } from './redis-location.service';
import { NearbySearchDTO } from './dto/nearby-search.dto';
import { CreatePlaceDTO } from './dto/create-place.dto';
import { GeocodeDTO } from './dto/geocode.dto';
import { UpdateLocationDTO } from './dto/update-location.dto';

const MAPBOX_API_BASE = 'https://api.mapbox.com';

export interface StudioRow {
  studio_id: string;
  name: string;
  description: string | null;
  place_id: string;
  lat: number;
  lng: number;
  city: string | null;
  country: string | null;
  distance_m: number;
}

export interface EventRow {
  event_id: string;
  title: string;
  starts_at: Date | null;
  ends_at: Date | null;
  place_id: string;
  lat: number;
  lng: number;
  city: string | null;
  country: string | null;
  distance_m: number;
}

export interface PlaceRow {
  place_id: string;
}

@Injectable()
export class GeoService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redisLocation: RedisLocationService,
  ) {}

  async setMyLocation(userId: string, dto: UpdateLocationDTO) {
    await this.redisLocation.setUserLocation(userId, dto.lat, dto.lng);
    return { message: 'Ubicación actualizada correctamente' };
  }

  async removeMyLocation(userId: string) {
    await this.redisLocation.removeUserLocation(userId);
    return { message: 'Dejaste de compartir tu ubicación' };
  }

  async searchNearby(dto: NearbySearchDTO) {
    const radiusMeters = dto.radius_km * 1000;

    const [studios, events, nearbyUserIds] = await Promise.all([
      this.findNearbyStudios(dto.lat, dto.lng, radiusMeters),
      this.findNearbyEvents(dto.lat, dto.lng, radiusMeters),
      this.redisLocation.getNearbyUsers(dto.lat, dto.lng, dto.radius_km),
    ]);

    const users = nearbyUserIds.length > 0
      ? await this.enrichNearbyUsers(nearbyUserIds)
      : [];

    return {
      center: { lat: dto.lat, lng: dto.lng },
      radius_km: dto.radius_km,
      results: { studios, events, users },
    };
  }

  private async findNearbyStudios(lat: number, lng: number, radiusMeters: number) {
    try {
      return await this.prisma.$queryRaw<StudioRow[]>`
        SELECT
          s.studio_id::text,
          s.name,
          s.description,
          p.place_id::text,
          p.lat,
          p.lng,
          p.city,
          p.country,
          ROUND(ST_Distance(
            p.geom::geography,
            ST_SetSRID(ST_MakePoint(${lng}::float, ${lat}::float), 4326)::geography
          )::numeric, 0)::int AS distance_m
        FROM studios.studios s
        INNER JOIN geo.places p ON s.place_id = p.place_id
        WHERE s.is_active = true
          AND p.geom IS NOT NULL
          AND ST_DWithin(
            p.geom::geography,
            ST_SetSRID(ST_MakePoint(${lng}::float, ${lat}::float), 4326)::geography,
            ${radiusMeters}::float
          )
        ORDER BY distance_m ASC
        LIMIT 50
      `;
    } catch (err) {
      console.error('ERROR FIND NEARBY STUDIOS =>', err);
      return [];
    }
  }

  private async findNearbyEvents(lat: number, lng: number, radiusMeters: number) {
    try {
      return await this.prisma.$queryRaw<EventRow[]>`
        SELECT
          e.event_id::text,
          e.title,
          e.starts_at,
          e.ends_at,
          p.place_id::text,
          p.lat,
          p.lng,
          p.city,
          p.country,
          ROUND(ST_Distance(
            p.geom::geography,
            ST_SetSRID(ST_MakePoint(${lng}::float, ${lat}::float), 4326)::geography
          )::numeric, 0)::int AS distance_m
        FROM events.events e
        INNER JOIN geo.places p ON e.place_id = p.place_id
        WHERE e.is_cancelled = false
          AND p.geom IS NOT NULL
          AND (e.ends_at IS NULL OR e.ends_at > NOW())
          AND ST_DWithin(
            p.geom::geography,
            ST_SetSRID(ST_MakePoint(${lng}::float, ${lat}::float), 4326)::geography,
            ${radiusMeters}::float
          )
        ORDER BY distance_m ASC
        LIMIT 50
      `;
    } catch (err) {
      console.error('ERROR FIND NEARBY EVENTS =>', err);
      return [];
    }
  }

  private async enrichNearbyUsers(
    nearbyUsers: Array<{ userId: string; lat: number; lng: number; distance_km: number }>,
  ) {
    const userIds = nearbyUsers.map((u) => u.userId);

    const profiles = await this.prisma.users.findMany({
      where: { user_id: { in: userIds }, is_active: true },
      select: {
        user_id: true,
        username: true,
        display_name: true,
        profile_visibility: true,
      },
    });

    const profileMap = new Map(profiles.map((p) => [p.user_id, p]));

    return nearbyUsers
      .map(({ userId, lat, lng, distance_km }) => {
        const profile = profileMap.get(userId);
        if (!profile || profile.profile_visibility === 'private') return null;
        return {
          user_id: userId,
          username: profile.username,
          display_name: profile.display_name,
          lat,
          lng,
          distance_km: Math.round(distance_km * 100) / 100,
        };
      })
      .filter((u): u is NonNullable<typeof u> => u !== null);
  }

  async geocodeAddress(dto: GeocodeDTO) {
    const token = this.getMapboxToken();
    const encoded = encodeURIComponent(dto.q);

    const params = new URLSearchParams({
      access_token: token,
      language: 'es',
      limit: '5',
      types: 'address,place,locality,neighborhood',
    });

    if (dto.proximity_lat !== undefined && dto.proximity_lng !== undefined) {
      params.set('proximity', `${dto.proximity_lng},${dto.proximity_lat}`);
    }

    const url = `${MAPBOX_API_BASE}/geocoding/v5/mapbox.places/${encoded}.json?${params}`;

    try {
      const response = await fetch(url);

      if (!response.ok) {
        throw new BadRequestException('Error al consultar el servicio de geocodificación');
      }

      const data = await response.json() as { features: any[] };

      return {
        suggestions: (data.features ?? []).map((f: any) => ({
          mapbox_id: f.id as string,
          name: f.place_name as string,
          lat: (f.center as [number, number])[1],
          lng: (f.center as [number, number])[0],
          address_line1: f.properties?.address ?? null,
          city: this.extractContext(f.context, 'place'),
          region: this.extractContext(f.context, 'region'),
          country: this.extractContext(f.context, 'country'),
          postal_code: this.extractContext(f.context, 'postcode'),
        })),
      };
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      console.error('ERROR GEOCODE =>', error);
      throw new InternalServerErrorException('Error al geocodificar la dirección');
    }
  }

  async createPlace(dto: CreatePlaceDTO) {
    if (dto.mapbox_id) {
      const existing = await this.prisma.places.findFirst({
        where: { provider: 'mapbox', external_id: dto.mapbox_id },
        select: { place_id: true, name: true, lat: true, lng: true, city: true, country: true },
      });
      if (existing) return existing;
    }

    try {
      const result = await this.prisma.$queryRaw<PlaceRow[]>`
        INSERT INTO geo.places (
          place_id, name, address_line1, city, region,
          postal_code, country, lat, lng, geom,
          provider, external_id, created_at, updated_at
        ) VALUES (
          gen_random_uuid(),
          ${dto.name},
          ${dto.address_line1 ?? null},
          ${dto.city ?? null},
          ${dto.region ?? null},
          ${dto.postal_code ?? null},
          ${dto.country ?? null},
          ${dto.lat},
          ${dto.lng},
          ST_SetSRID(ST_MakePoint(${dto.lng}::float, ${dto.lat}::float), 4326),
          ${dto.mapbox_id ? 'mapbox' : null},
          ${dto.mapbox_id ?? null},
          NOW(),
          NOW()
        )
        RETURNING place_id::text
      `;

      return {
        place_id: result[0].place_id,
        name: dto.name,
        lat: dto.lat,
        lng: dto.lng,
        city: dto.city ?? null,
        country: dto.country ?? null,
      };
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException('Ya existe un lugar con ese identificador');
      }
      console.error('ERROR CREATE PLACE =>', error);
      throw new InternalServerErrorException('Error al crear el lugar');
    }
  }

  private extractContext(context: any[] | undefined, type: string): string | null {
    if (!context) return null;
    const item = context.find((c: any) => String(c.id).startsWith(type));
    return item?.text ?? null;
  }

  private getMapboxToken(): string {
    const token = process.env.MAPBOX_ACCESS_TOKEN;
    if (!token) {
      throw new BadRequestException('Falta configurar MAPBOX_ACCESS_TOKEN');
    }
    return token;
  }
}