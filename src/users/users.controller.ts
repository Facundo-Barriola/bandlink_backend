import { Controller, Get, Patch, Body, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { JwtAuthGuard } from 'src/auth/jwt-auth.guard';
import { UsersService } from './users.service';
import { UpdateMeDTO } from './dto/update-me.dto';

@Controller('users')
export class UsersController {
    constructor(private readonly usersService: UsersService) { }

    @Get('me')
    @UseGuards(JwtAuthGuard)
    getMe(@Req() req: Request & { user: any }) {
        return this.usersService.getMe(req.user.userId);
    }

    @Patch('me')
    @UseGuards(JwtAuthGuard)
    updateMe(
        @Req() req: Request & { user: any },
        @Body() dto: UpdateMeDTO,
    ) {
        return this.usersService.updateMe(req.user.userId, dto);
    }
}