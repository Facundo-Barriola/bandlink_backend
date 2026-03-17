import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { MusicianService } from './musicians.service';
import { MusiciansController } from './musicians.controller';
import { AuthService } from 'src/auth/auth.service';

@Module({
    controllers:[MusiciansController],
    providers:[MusicianService, AuthService],
    exports:[MusicianService]
})
export class MusiciansModule {}