import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { MusiciansModule } from './musicos/musicians.module';
import { StudiosModule } from './studios/studios.module';
import { UsersModule } from './users/users.module';
import { MediaModule } from './media/media.module';
import { EventssModule } from './events/events.module';
import { BookingsModule } from './bookings/bookings.module';
import { PaymentsModule } from './payments/payments.module';

@Module({
  imports: [PrismaModule, AuthModule, MusiciansModule, StudiosModule, UsersModule, MediaModule, EventssModule, BookingsModule, PaymentsModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
