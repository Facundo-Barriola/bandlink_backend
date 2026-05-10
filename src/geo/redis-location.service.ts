import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import Redis from 'ioredis';

const GEO_KEY = 'bandlink:users:geo';
const ACTIVE_PREFIX = 'bandlink:users:active:';
const LOCATION_TTL_SECONDS = 300; // 5 minutos

export interface UserGeoResult {
  userId: string;
  lat: number;
  lng: number;
  distance_km: number;
}

@Injectable()
export class RedisLocationService implements OnModuleInit, OnModuleDestroy {
  private redis!: Redis;
  private connected = false;

  async onModuleInit() {
    this.redis = new Redis({
      host: process.env.REDIS_HOST ?? 'localhost',
      port: Number(process.env.REDIS_PORT ?? 6379),
      password: process.env.REDIS_PASSWORD || undefined,
      lazyConnect: true,
    });

    try {
      await this.redis.connect();
      this.connected = true;
    } catch (err) {
      console.warn('Redis no disponible — ubicaciones en tiempo real desactivadas:', err);
    }
  }

  async onModuleDestroy() {
    if (this.connected) {
      await this.redis.quit();
    }
  }

  async setUserLocation(userId: string, lat: number, lng: number): Promise<void> {
    if (!this.connected) return;
    await this.redis.geoadd(GEO_KEY, lng, lat, userId);
    await this.redis.set(`${ACTIVE_PREFIX}${userId}`, '1', 'EX', LOCATION_TTL_SECONDS);
  }

  async removeUserLocation(userId: string): Promise<void> {
    if (!this.connected) return;
    await this.redis.zrem(GEO_KEY, userId);
    await this.redis.del(`${ACTIVE_PREFIX}${userId}`);
  }

  async getNearbyUsers(
    lat: number,
    lng: number,
    radiusKm: number,
  ): Promise<UserGeoResult[]> {
    if (!this.connected) return [];

    try {
      const raw = await this.redis.call(
        'GEOSEARCH',
        GEO_KEY,
        'FROMLONLAT', String(lng), String(lat),
        'BYRADIUS', String(radiusKm), 'km',
        'ASC',
        'COUNT', '100',
        'WITHCOORD',
        'WITHDIST',
      ) as Array<[string, string, [string, string]]>;

      if (!raw || raw.length === 0) return [];

      const results = await Promise.all(
        raw.map(async ([userId, distStr, [lngStr, latStr]]) => {
          const isActive = await this.redis.exists(`${ACTIVE_PREFIX}${userId}`);
          if (!isActive) return null;

          return {
            userId,
            lat: parseFloat(latStr),
            lng: parseFloat(lngStr),
            distance_km: parseFloat(distStr),
          };
        }),
      );

      return results.filter((r): r is UserGeoResult => r !== null);
    } catch (err) {
      console.error('ERROR REDIS GEOSEARCH =>', err);
      return [];
    }
  }

  isAvailable() {
    return this.connected;
  }
}