import { ConflictException, Injectable, InternalServerErrorException, UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { JwtService } from '@nestjs/jwt';
import { Prisma} from '../generated/prisma/client';
import { PrismaService } from './../prisma/prisma.service';
import { LoginDTO } from './dto/login.dto';
import { RegisterDTO } from './dto/register.dto';
import { ForgotPasswordDTO } from './dto/forgotPassword.dto';
import { ResetPasswordDTO } from './dto/resetPassword.dto';
import { RefreshTokenDTO } from './dto/refresh-token.dto';
import { createHash, randomBytes } from 'node:crypto';
import { MailerService } from '../mailer/resend.service';
 
@Injectable()
export class AuthService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly jwtService: JwtService,
        private readonly mailerService: MailerService,
    ){}

    private hashRefreshToken(token: string) {
      return createHash('sha256').update(token).digest('hex');
    }

    private generateRefreshToken() {
      return randomBytes(48).toString('hex');
    }

    private getRefreshTokenExpiresAt() {
      const days = Number(process.env.REFRESH_TOKEN_TTL_DAYS ?? 30);
      return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
    }

    private async signAccessToken(user: {
      user_id: string;
      email: string;
      username: string;
    }, sessionId: string) {
      return this.jwtService.signAsync({
        sub: user.user_id,
        email: user.email,
        username: user.username,
        sid: sessionId,
      });
    }

    async login(dto: LoginDTO,
        meta?: { userAgent?: string | null; ip?: string | null },
    ){
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

        const refreshToken = this.generateRefreshToken();
        const refreshTokenHash = this.hashRefreshToken(refreshToken);
        const refreshExpiresAt = this.getRefreshTokenExpiresAt();

        const session = await this.prisma.sessions.create({
          data: {
            user_id: user.user_id,
            refresh_token_hash: refreshTokenHash,
            user_agent: meta?.userAgent ?? null,
            ip: meta?.ip ?? null,
            expires_at: refreshExpiresAt,
            revoked_at: null,
          },
          select: {
            session_id: true,
            expires_at: true,
          },
        });
    
        const access_token = await this.signAccessToken(user, session.session_id);        

        
        return {
            access_token,
            refresh_token: refreshToken,
            session_id: session.session_id,
            refresh_expires_at: session.expires_at,
            message: 'Login correcto',
            user: {
                userId: user.user_id,
                email: user.email,
                username: user.username,
                displayName: user.display_name,
                emailVerified: user.email_verified,
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
                    phone: dto.phone ?? null,
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
          const verificationToken = await this.createEmailVerificationToken(user.user_id);
          
          try {
            await this.mailerService.sendVerificationMail(user.email, verificationToken);
          } catch (mailError) {
            console.error('ERROR SEND VERIFICATION MAIL =>', mailError);
          }

            
          return{
                message: 'Usuario creado correctamente',
                user,
            };

        } catch (error){
            if( error instanceof Prisma.PrismaClientKnownRequestError ){

               if (error.code === 'P2002') {
                    throw new ConflictException('El mail o username ya está registrado');
                  }
                
                  if (error.code === 'P2003') {
                    throw new ConflictException('Referencia inválida en una clave foránea');
                  }
                
                  if (error.code === 'P2022') {
                    throw new InternalServerErrorException('La base no coincide con el schema de Prisma');
                  }
                
                  if (error.code === 'P2004') {
                    throw new ConflictException('Violación de restricción en base de datos');
                  }
            }
            console.error('ERROR REGISTER USER =>', error)
            throw new InternalServerErrorException('No se pudo crear el usuario');
        }
    }

    async forgotPassword(dto: ForgotPasswordDTO){
        const genericMessage = 'Te enviamos instrucciones para restablecer la contraseña';
        const user = await this.prisma.users.findFirst({
            where: {
                email: dto.email,
                is_active: true,
            },
            select: {
                user_id: true,
                email: true,
                display_name: true,
            },
        });

        if (!user) {
            return { message: genericMessage };
        }
        const rawToken = randomBytes(32).toString('hex');
        const tokenHash = createHash('sha256').update(rawToken).digest('hex');
        const ttlMinutes = Number(process.env.RESET_PASSWORD_TOKEN_TTL_MINUTES ?? 15);
        const expiresAt = new Date(Date.now() + ttlMinutes * 60 * 1000);

        await this.prisma.password_reset_tokens.updateMany({
            where: {
                user_id: user.user_id,
                consumed_at: null,
            },
            data: {
                consumed_at: new Date(),
            },
        });

        await this.prisma.password_reset_tokens.create({
          data: {
            user_id: user.user_id,
            token_hash: tokenHash,
            expires_at: expiresAt,
            ip: null,
            user_agent: null,
          },
        });

        try {
          await this.mailerService.sendResetPasswordEmail(user.email, rawToken);
        } catch (mailError) {
          console.error('ERROR SEND RESET PASSWORD MAIL =>', mailError);
        }        

        const frontendUrl = process.env.FRONTEND_URL ?? 'http://localhost:3000';
        const resetLink = `${frontendUrl}/reset-password?token=${rawToken}`;

        return {
          message: genericMessage,
          ...(process.env.NODE_ENV !== 'production' && {
            resetToken: rawToken,
            resetLink,
          }),
        };

    }

    async resetPassword(dto: ResetPasswordDTO){
        const tokenHash = createHash('sha256')
        .update(dto.token)
        .digest('hex');

        const resetToken = await this.prisma.password_reset_tokens.findFirst({
          where: {
            token_hash: tokenHash,
          },
          select: {
            token_id: true,
            user_id: true,
            expires_at: true,
            consumed_at: true,
          },
        });

        if (!resetToken) {
            throw new UnauthorizedException('Token inválido o expirado');
        }

        if (resetToken.consumed_at) {
          throw new UnauthorizedException('Token inválido o expirado');
        }

        if (resetToken.expires_at < new Date()) {
          throw new UnauthorizedException('Token inválido o expirado');
        }

        const newPasswordHash = await bcrypt.hash(dto.newPassword, 10);
        
        await this.prisma.$transaction([

            this.prisma.users.update({
                where: {
                  user_id: resetToken.user_id,
                },
                data: {
                  password_hash: newPasswordHash,
                  updated_at: new Date(),
                },
            }),

            this.prisma.password_reset_tokens.update({
                where: {
                  token_id: resetToken.token_id,
                },
                data: {
                  consumed_at: new Date(),
                },
            }),

            this.prisma.sessions.updateMany({
                where: {
                  user_id: resetToken.user_id,
                  revoked_at: null,
                },
                data: {
                  revoked_at: new Date(),
                },
            }),
        ]);

        return {
            message: 'Contraseña actualizada correctamente. Inicia sesión nuevamente.',
        };
    }
    async refreshToken(
      dto: RefreshTokenDTO,
      meta?: { userAgent?: string | null; ip?: string | null },
    ) {
      const session = await this.prisma.sessions.findUnique({
        where: {
          session_id: dto.sessionId,
        },
        select: {
          session_id: true,
          user_id: true,
          refresh_token_hash: true,
          expires_at: true,
          revoked_at: true,
          users: {
            select: {
              user_id: true,
              email: true,
              username: true,
              display_name: true,
              email_verified: true,
              is_active: true,
            },
          },
        },
      });

      if (!session) {
        throw new UnauthorizedException('Sesión inválida');
      }

      if (session.revoked_at) {
        throw new UnauthorizedException('Sesión revocada');
      }

      if (!session.expires_at || session.expires_at < new Date()) {
        throw new UnauthorizedException('Refresh token expirado');
      }

      if (!session.users.is_active) {
        throw new UnauthorizedException('Usuario inactivo');
      }

      const incomingHash = this.hashRefreshToken(dto.refreshToken);
      const newRefreshToken = this.generateRefreshToken();
      const newRefreshTokenHash = this.hashRefreshToken(newRefreshToken);
      const newExpiresAt = this.getRefreshTokenExpiresAt();

      const rotated = await this.prisma.sessions.updateMany({
        where: {
          session_id: dto.sessionId,
          refresh_token_hash: incomingHash,
          revoked_at: null,
          expires_at: {
            gt: new Date(),
          },
        },
        data: {
          refresh_token_hash: newRefreshTokenHash,
          expires_at: newExpiresAt,
          user_agent: meta?.userAgent ?? undefined,
          ip: meta?.ip ?? undefined,
        },
      });

      if (rotated.count !== 1) {
        throw new UnauthorizedException('Refresh token inválido o reutilizado');
      }

      const access_token = await this.signAccessToken(
        {
          user_id: session.users.user_id,
          email: session.users.email,
          username: session.users.username,
        },
        session.session_id,
      );

      return {
        access_token,
        refresh_token: newRefreshToken,
        session_id: session.session_id,
        refresh_expires_at: newExpiresAt,
        user: {
          userId: session.users.user_id,
          email: session.users.email,
          username: session.users.username,
          displayName: session.users.display_name,
          emailVerified: session.users.email_verified,
        },
      };
    }

    async logout(userId: string, sessionId: string) {
      await this.prisma.sessions.updateMany({
        where: {
          session_id: sessionId,
          user_id: userId,
          revoked_at: null,
        },
        data: {
          revoked_at: new Date(),
          refresh_token_hash: null,
        },
      });
  
      return {
        message: 'Sesión cerrada correctamente',
      };
    }
    
    async logoutAll(userId: string) {
      const result = await this.prisma.sessions.updateMany({
        where: {
          user_id: userId,
          revoked_at: null,
        },
        data: {
          revoked_at: new Date(),
          refresh_token_hash: null,
        },
      });
  
      return {
        message: 'Todas las sesiones fueron revocadas',
        revokedSessions: result.count,
      };
    }

    async verifyEmail(token: string) {
      const tokenHash = createHash('sha256').update(token).digest('hex');

      const verificationToken = await this.prisma.email_verification_tokens.findFirst({
        where: {
          token_hash: tokenHash,
          consumed_at: null,
          expires_at: {
            gt: new Date(),
          },
        },
      });
    
      if (!verificationToken) {
        throw new UnauthorizedException('Token inválido o expirado');
      }
    
      await this.prisma.$transaction([
        this.prisma.users.update({
          where: { user_id: verificationToken.user_id },
          data: { email_verified: true },
        }),
        this.prisma.email_verification_tokens.update({
          where: { token_id: verificationToken.token_id },
          data: { consumed_at: new Date() },
        }),
      ]);
    
      return { message: 'Email verificado correctamente' };
    }

    private async createEmailVerificationToken(userId: string) {
      const rawToken = randomBytes(32).toString('hex');
      const tokenHash = createHash('sha256').update(rawToken).digest('hex');
      
      const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24);
      await this.prisma.email_verification_tokens.updateMany({
        where: {
          user_id: userId,
          consumed_at: null,
        },
        data: {
          consumed_at: new Date(),
        },
      });       
      
      await this.prisma.email_verification_tokens.create({
        data: {
          user_id: userId,
          token_hash: tokenHash,
          expires_at: expiresAt,
          consumed_at: null,
        },
      });
    
      return rawToken;
  }
}