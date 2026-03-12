import { ConflictException, Injectable, InternalServerErrorException, UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { JwtService } from '@nestjs/jwt';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { LoginDTO } from './dto/login.dto';
import { RegisterDTO } from './dto/register.dto';

@Injectable()
export class AuthService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly jwtService: JwtService,
    ){}

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
        
        const payload = {
            sub: user.user_id,
            email: user.email,
            username: user.username,
        };

        const access_token = await this.jwtService.signAsync(payload);
        
        return {
            access_token,
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

    async registerUser(dto: RegisterDTO){
        const userExist = await this.prisma.users.findFirst({
            where:{
                email: dto.email
            },
            select: {
                user_id: true
            }
        });

        if (userExist){
            throw new ConflictException('Ya existe usuario con este mail');
        }

        const userExistByUsername = await this.prisma.users.findFirst({
            where: { username: dto.username },
            select: { user_id: true },
        });

        if (userExistByUsername) {
          throw new ConflictException('Ya existe un usuario con este username');
        }

        const password_hash = await bcrypt.hash(dto.password, 10);

        try{
            const user = await this.prisma.users.create({
                data:{
                    email: dto.email,
                    username: dto.username,
                    display_name: dto.display_name,
                    password_hash,
                    bio: dto.bio ?? null,
                    birthdate: dto.birthdate ? new Date(dto.birthdate) : null,
                    profile_visibility: 'public',
                    place_id: null,
                    is_active: true,
                    email_verified: false,
                },
                select: {
                    user_id: true,
                    email: true,
                    username: true,
                    display_name: true,
                    bio: true,
                    phone: true,
                    birthdate: true,
                    is_active: true,
                    email_verified: true,
                    created_at: true,
                },
            });
            return{
                message: 'Usuario creado correctamente',
                user,
            };
        } catch (error){
            if( error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002' ){
                throw new ConflictException(' El mail o username ya está registrado');
            }
            throw new InternalServerErrorException('No se pudo crear el usuario');
        }
    }
}