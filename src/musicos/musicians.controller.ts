import { Body, Controller, Post, UseGuards, Get, Req, Param, Delete, Patch, Query } from '@nestjs/common';
import { MusicianService } from "./musicians.service";
import { CreateMusicianDTO } from "./dto/musician.dto";
import { JwtAuthGuard } from 'src/auth/jwt-auth.guard';
import { AddGenresDTO } from './dto/addGenres.dto';
import { AddInstrumentDTO, UpdateInstrumentDTO } from './dto/instrument.dto';
import { UpdateProfileDTO } from './dto/update-profile.dto';
import { DiscoverMusiciansDTO } from './dto/discover-musician.dto';

@Controller('musicians')
export class MusiciansController {
  constructor(private readonly musicianService: MusicianService) { }

  @Post()
  @UseGuards(JwtAuthGuard)
  createMusicianProfile(@Req() req: Request & { user: any }, @Body() dto: CreateMusicianDTO) {
    return this.musicianService.createMusician(req.user.userId, dto);
  }

  @Get('profile')
  @UseGuards(JwtAuthGuard)
  getFullMusicianProfile(@Req() req: Request & { user: any }) {
    return this.musicianService.getMyProfilePage(req.user.userId);
  }

  @Patch('profile')
  @UseGuards(JwtAuthGuard)
  updateMusicianProfile(
    @Req() req: Request & { user: any },
    @Body() dto: UpdateProfileDTO,
  ) {
    return this.musicianService.updateMusicianProfile(req.user.userId, dto);
  }


  @Get('profile/bands')
  @UseGuards(JwtAuthGuard)
  getBandsForMusician(@Req() req: Request & { user: any }) {
    return this.musicianService.getBandsForMusician(req.user.userId);
  }

  @Post('profile/genres')
  @UseGuards(JwtAuthGuard)
  addGenres(
    @Req() req: Request & { user: any },
    @Body() dto: AddGenresDTO,
  ) {
    return this.musicianService.addGenresToMusician(req.user.userId, dto);
  }

  @Delete('profile/genres/:genreId')
  @UseGuards(JwtAuthGuard)
  removeGenre(
    @Req() req: Request & { user: any },
    @Param('genreId') genreId: string,
  ) {
    return this.musicianService.removeGenreFromMusician(
      req.user.userId,
      genreId,
    );
  }

  @Post('profile/instruments')
  @UseGuards(JwtAuthGuard)
  addInstrument(
    @Req() req: Request & { user: any },
    @Body() dto: AddInstrumentDTO,
  ) {
    return this.musicianService.addInstrumentToMusician(req.user.userId, dto);
  }

  @Patch('profile/instruments/:musicianInstrumentId')
  @UseGuards(JwtAuthGuard)
  updateInstrument(
    @Req() req: Request & { user: any },
    @Param('musicianInstrumentId') musicianInstrumentId: string,
    @Body() dto: UpdateInstrumentDTO,
  ) {
    return this.musicianService.updateMusicianInstrument(
      req.user.userId,
      musicianInstrumentId,
      dto,
    );
  }

  @Delete('profile/instruments/:musicianInstrumentId')
  @UseGuards(JwtAuthGuard)
  removeInstrument(
    @Req() req: Request & { user: any },
    @Param('musicianInstrumentId') musicianInstrumentId: string,
  ) {
    return this.musicianService.removeMusicianInstrument(
      req.user.userId,
      musicianInstrumentId,
    );
  }

  @Get('profile/:userId')
  @UseGuards(JwtAuthGuard)
  getMusicianProfile(@Param('userId') userId: string) {
    return this.musicianService.getMyProfilePage(userId);
  }

  @Get('discover')
  @UseGuards(JwtAuthGuard)
  discoverMusicians(
    @Req() req: Request & { user: any },
    @Query() query: DiscoverMusiciansDTO,
  ) {
    return this.musicianService.discoverMusicians(req.user.userId, query);
  }

  @Get('catalog/instruments')
  @UseGuards(JwtAuthGuard)
  getInstrumentCatalog(@Query('search') search?: string) {
    return this.musicianService.getInstrumentCatalog(search);
  }

  @Get('catalog/genres')
  @UseGuards(JwtAuthGuard)
  getGenreCatalog(@Query('search') search?: string) {
    return this.musicianService.getGenreCatalog(search);
  }

}