import { Module } from '@nestjs/common';
import { MusicianService } from './musicians.service';
import { MusiciansController } from './musicians.controller';
import { AuthModule } from 'src/auth/auth.module';

@Module({
    imports: [AuthModule],
    controllers:[MusiciansController],
    providers:[MusicianService],
    exports:[MusicianService]
})
export class MusiciansModule {}