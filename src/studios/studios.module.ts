import { Module } from '@nestjs/common';
import { StudiosService } from './studios.service';
import { StudiosController } from './studios.controller';
import { AuthModule } from 'src/auth/auth.module';
import { BookingsModule } from 'src/bookings/bookings.module';

@Module({
    imports: [AuthModule, BookingsModule],
    controllers:[StudiosController],
    providers:[StudiosService],
    exports:[StudiosService]
})
export class StudiosModule {}