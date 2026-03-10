import { Injectable, UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { LoginDTO } from './dto/login.dto';

@Injectable()
export class AuthService {
    constructor(private readonly prisma: PrismaService){}

    async login(dto: LoginDTO){
        const user = await this.prisma.users.findFirst({
            where: {
                email: dto.email,
            },
            select: {
                user_id: true,
                email: true,
                username: true,
                display_name: true,
                password_hash: true,
                is_active: true,
                email_verified: true
            }
        });
        if (!user){
            throw new UnauthorizedException('Email o contraseña incorrectos');
        }

        if(user.is_active === false) {
            throw new UnauthorizedException('Usuario inactivo');
        } 

        const passwordOK = await bcrypt.compare(dto.password, user.password_hash);

        if(!passwordOK){
            throw new UnauthorizedException('Email o contraseña Incorrectos');
        }

        return {
            message: 'Login correcto',
            user: {
                userId: user.user_id,
                email: user.email,
                username: user.username,
                displayName: user.display_name,
                emailVerfied: user.email_verified,
            }
        };
    }
}