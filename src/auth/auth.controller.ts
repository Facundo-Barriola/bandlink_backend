import { Body, Controller, Post, UseGuards, Get, Req } from '@nestjs/common';
import { AuthService } from './auth.service';
import { LoginDTO } from './dto/login.dto';
import { RegisterDTO } from './dto/register.dto';
import { JwtAuthGuard } from './jwt-auth.guard';

@Controller('auth')
export class AuthController {
    constructor(private readonly authService: AuthService ) {}

    @Post('login')
    login(@Body() dto: LoginDTO){
        return this.authService.login(dto);
    }

    @Post('register')
    register(@Body() dto: RegisterDTO){
        return this.authService.registerUser(dto);
    }

    @UseGuards(JwtAuthGuard)
    @Get('me')
    me(@Req() req: any) {
        return req.user;
    }
}