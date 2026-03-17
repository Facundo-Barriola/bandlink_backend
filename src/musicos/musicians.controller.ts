import { Body, Controller, Post, UseGuards, Get, Req } from '@nestjs/common';
import { MusicianService } from "./musicians.service";
import { CreateMusicianDTO  } from "./dto/musician.dto";
import { JwtAuthGuard } from 'src/auth/jwt-auth.guard';

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

}