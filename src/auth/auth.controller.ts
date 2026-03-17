import { Body, Controller, Post, UseGuards, Get, Req } from '@nestjs/common';
import { AuthService } from './auth.service';
import { LoginDTO } from './dto/login.dto';
import { RegisterDTO } from './dto/register.dto';
import { JwtAuthGuard } from './jwt-auth.guard';
import { ResetPasswordDTO } from './dto/resetPassword.dto';
import { ForgotPasswordDTO } from './dto/forgotPassword.dto';
import { RefreshTokenDTO } from './dto/refresh-token.dto';
import { VerifyEmailDTO } from './dto/verify-email.dto';

@Controller('auth')
export class AuthController {
    constructor(private readonly authService: AuthService ) {}

    private getIp(req: any) {
        const xForwardedFor = req.headers['x-forwarded-for'];

        if (typeof xForwardedFor === 'string') {
          return xForwardedFor.split(',')[0].trim();
        }

        return req.ip ?? null;
    }

    @Post('login')
    login(@Body() dto: LoginDTO, @Req() req: any){
        return this.authService.login(dto, {
            userAgent: req.get?.('user-agent') ?? null,
            ip: this.getIp(req),
        });
    }

    @Post('register')
    register(@Body() dto: RegisterDTO){
        return this.authService.registerUser(dto);
    }

    @Post('resetPassword')
    resetPassword(@Body() dto: ResetPasswordDTO){
        return this.authService.resetPassword(dto);
    }

    @Post('forgotPassword')
    forgotPassword(@Body() dto: ForgotPasswordDTO){
        return this.authService.forgotPassword(dto);
    }

    @Post('refresh')
    refresh(@Body() dto: RefreshTokenDTO, @Req() req: any) {
      return this.authService.refreshToken(dto, {
        userAgent: req.get?.('user-agent') ?? null,
        ip: this.getIp(req),
      });
    }

    @UseGuards(JwtAuthGuard)
    @Post('logout')
    logout(@Req() req: any) {
      return this.authService.logout(req.user.userId, req.user.sessionId);
    }

    @UseGuards(JwtAuthGuard)
    @Post('logout-all')
    logoutAll(@Req() req: any) {
      return this.authService.logoutAll(req.user.userId);
    }

    @UseGuards(JwtAuthGuard)
    @Get('me')
    me(@Req() req: any) {
        return req.user;
    }

    @UseGuards(JwtAuthGuard)
    @Get('getUserById/:userId')
    async getUserById(@Req() req: any) {
        const userId = req.params.userId;
        return this.authService.getUserById(userId);
    }

    @Post('verifyEmail')
    verifyEmail(@Body() dto: VerifyEmailDTO){
        return this.authService.verifyEmail(dto.token);
    }
}