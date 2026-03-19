import { Body, Controller, Post, UseGuards, Get, Req, Param, Delete, Patch } from '@nestjs/common';
import { MusicianService } from "./musicians.service";
import { CreateMusicianDTO  } from "./dto/musician.dto";
import { JwtAuthGuard } from 'src/auth/jwt-auth.guard';
import { AddGenresDTO } from './dto/addGenres.dto';
import { AddInstrumentDTO, UpdateInstrumentDTO } from './dto/instrument.dto';

@Controller('musicians')
export class MusiciansController {
    constructor(private readonly musicianService: MusicianService) {}

    @Post()
    @UseGuards(JwtAuthGuard)
    createMusicianProfile(@Req() req: Request & {user: any}, @Body() dto: CreateMusicianDTO  ){
        const userId = req.user.sub;
        return this.musicianService.createMusician( userId, dto);
    }

    @Get('profile')
    @UseGuards(JwtAuthGuard)
    getFullMusicianProfile(@Req() req: Request & {user: any}){
        const userId = req.user.sub;
        return this.musicianService.getMyProfilePage(userId);
    }


    @Get('profile/bands')
    @UseGuards(JwtAuthGuard)
    getBandsForMusician(@Req() req: Request & {user: any}){
        const userId = req.user.sub;
        return this.musicianService.getBandsForMusician(userId);
    }

    @Post('profile/genres')
    @UseGuards(JwtAuthGuard)
    addGenres(
      @Req() req: Request & { user: any },
      @Body() dto: AddGenresDTO,
    ) {
      return this.musicianService.addGenresToMusician(req.user.sub, dto);
    }

    @Post('profile/instruments')
    @UseGuards(JwtAuthGuard)
    addInstrument(
      @Req() req: Request & { user: any },
      @Body() dto: AddInstrumentDTO,
    ) {
      return this.musicianService.addInstrumentToMusician(req.user.sub, dto);
    }


    @Get('profile/:userId')
    @UseGuards(JwtAuthGuard)
    getMusicianProfile(@Param('userId') userId: string){
        return this.musicianService.getMyProfilePage(userId);
    }

    @Delete('profile/genres/:genreId')
    @UseGuards(JwtAuthGuard)
    removeGenre(
      @Req() req: Request & { user: any },
      @Param('genreId') genreId: string,
    ) {
      return this.musicianService.removeGenreFromMusician(req.user.sub, genreId);
    }

    @Patch('profile/instruments/:musicianInstrumentId')
    @UseGuards(JwtAuthGuard)
    updateInstrument(
      @Req() req: Request & { user: any },
      @Param('musicianInstrumentId') musicianInstrumentId: string,
      @Body() dto: UpdateInstrumentDTO,
    ) {
      return this.musicianService.updateMusicianInstrument(
        req.user.sub,
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
        req.user.sub,
        musicianInstrumentId,
      );
    }

}