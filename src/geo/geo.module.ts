import { Module } from '@nestjs/common';
import { GeoController } from './geo.controller';
import { GeoService } from './geo.service';
import { RedisLocationService } from './redis-location.service';
import { AuthModule } from 'src/auth/auth.module';

@Module({
  imports: [AuthModule],
  controllers: [GeoController],
  providers: [GeoService, RedisLocationService],
  exports: [GeoService, RedisLocationService],
})
export class GeoModule {}