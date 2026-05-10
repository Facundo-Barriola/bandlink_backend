import {
  Body,
  Controller,
  Delete,
  Get,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { JwtAuthGuard } from 'src/auth/jwt-auth.guard';
import { GeoService } from './geo.service';
import { NearbySearchDTO } from './dto/nearby-search.dto';
import { UpdateLocationDTO } from './dto/update-location.dto';
import { GeocodeDTO } from './dto/geocode.dto';
import { CreatePlaceDTO } from './dto/create-place.dto';

@Controller('geo')
export class GeoController {
  constructor(private readonly geoService: GeoService) {}

  @Get('nearby')
  @UseGuards(JwtAuthGuard)
  searchNearby(@Query() dto: NearbySearchDTO) {
    return this.geoService.searchNearby(dto);
  }

  @Put('location')
  @UseGuards(JwtAuthGuard)
  setMyLocation(
    @Req() req: Request & { user: any },
    @Body() dto: UpdateLocationDTO,
  ) {
    return this.geoService.setMyLocation(req.user.userId, dto);
  }

  @Delete('location')
  @UseGuards(JwtAuthGuard)
  removeMyLocation(@Req() req: Request & { user: any }) {
    return this.geoService.removeMyLocation(req.user.userId);
  }

  @Get('geocode')
  @UseGuards(JwtAuthGuard)
  geocodeAddress(@Query() dto: GeocodeDTO) {
    return this.geoService.geocodeAddress(dto);
  }

  @Post('places')
  @UseGuards(JwtAuthGuard)
  createPlace(@Body() dto: CreatePlaceDTO) {
    return this.geoService.createPlace(dto);
  }
}