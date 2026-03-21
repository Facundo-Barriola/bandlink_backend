import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrismaService } from '../prisma/prisma.service';

const jwtSecret = process.env.JWT_SECRET;

if (!jwtSecret) {
  throw new Error('JWT_SECRET no está definido');
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private readonly prisma: PrismaService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: process.env.JWT_SECRET as string,
    });
  }

  async validate(payload: { sub: string; email: string; username: string; sid: string }) {
    const session = await this.prisma.sessions.findUnique({
      where: { session_id: payload.sid },
      select:{
        session_id: true,
        user_id: true,
        revoked_at: true,
        expires_at: true,
        users:{
          select:{
            email: true,
            username: true,
            is_active: true,
            email_verified: true,
          },
        },
      },
    });

    if (!session){
      throw new UnauthorizedException('Sesión inválida');
    }
    if(session.user_id !== payload.sub){
      throw new UnauthorizedException('El token no corresponde al usuario');
    }

    if(session.revoked_at){
      throw new UnauthorizedException('La sesión ha sido revocada');
    }

    if(!session.expires_at || session.expires_at < new Date()){
      throw new UnauthorizedException('La sesión ha expirado');
    }

    if(!session.users.is_active){
      throw new UnauthorizedException('El usuario no está activo');
    }
    return {
      userId: payload.sub,
      email: session.users.email,
      username: session.users.username,
      sessionId: payload.sid,
      emailVerified: session.users.email_verified,
    };
  }
}