import { Module } from '@nestjs/common';
import { StudiosService } from './studios.service';
import { StudiosController } from './studios.controller';
import { AuthModule } from 'src/auth/auth.module';

@Module({
    imports: [AuthModule],
    controllers:[StudiosController],
    providers:[StudiosService],
    exports:[StudiosService]
})
export class StudiosModule {}