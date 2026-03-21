import {
  Body,
  Controller,
  Post,
  UseGuards,
  Get,
  Req,
  Param,
  Patch,
  Delete,
} from '@nestjs/common';
import { Request } from 'express';
import { JwtAuthGuard } from 'src/auth/jwt-auth.guard';
import { StudiosService } from './studios.service';
import { CreateStudioDTO } from './dto/create-studio.dto';
import { UpdateStudioDTO } from './dto/update-studio.dto';
import { CreateRoomDTO } from './dto/create-room.dto';
import { UpdateRoomDTO } from './dto/update-room.dto';

@Controller('studios')
export class StudiosController {
  constructor(private readonly studiosService: StudiosService) {}

  @Post()
  @UseGuards(JwtAuthGuard)
  createStudio(
    @Req() req: Request & { user: any },
    @Body() dto: CreateStudioDTO,
  ) {
    return this.studiosService.createStudio(req.user.userId, dto);
  }

  @Get('mine')
  @UseGuards(JwtAuthGuard)
  getMyStudios(@Req() req: Request & { user: any }) {
    return this.studiosService.getMyStudios(req.user.userId);
  }

  @Get(':studioId')
  @UseGuards(JwtAuthGuard)
  getStudioById(@Param('studioId') studioId: string) {
    return this.studiosService.getStudioById(studioId);
  }

  @Patch(':studioId')
  @UseGuards(JwtAuthGuard)
  updateStudio(
    @Req() req: Request & { user: any },
    @Param('studioId') studioId: string,
    @Body() dto: UpdateStudioDTO,
  ) {
    return this.studiosService.updateStudio(req.user.userId, studioId, dto);
  }

  @Patch(':studioId/active')
  @UseGuards(JwtAuthGuard)
  setStudioActive(
    @Req() req: Request & { user: any },
    @Param('studioId') studioId: string,
    @Body('is_active') isActive: boolean,
  ) {
    return this.studiosService.setStudioActive(req.user.userId, studioId, isActive);
  }

  @Post(':studioId/rooms')
  @UseGuards(JwtAuthGuard)
  createRoom(
    @Req() req: Request & { user: any },
    @Param('studioId') studioId: string,
    @Body() dto: CreateRoomDTO,
  ) {
    return this.studiosService.createRoom(req.user.userId, studioId, dto);
  }

  @Get(':studioId/rooms')
  @UseGuards(JwtAuthGuard)
  getRoomsByStudio(@Param('studioId') studioId: string) {
    return this.studiosService.getRoomsByStudio(studioId);
  }

  @Patch(':studioId/rooms/:roomId')
  @UseGuards(JwtAuthGuard)
  updateRoom(
    @Req() req: Request & { user: any },
    @Param('studioId') studioId: string,
    @Param('roomId') roomId: string,
    @Body() dto: UpdateRoomDTO,
  ) {
    return this.studiosService.updateRoom(req.user.userId, studioId, roomId, dto);
  }

  @Delete(':studioId/rooms/:roomId')
  @UseGuards(JwtAuthGuard)
  deleteRoom(
    @Req() req: Request & { user: any },
    @Param('studioId') studioId: string,
    @Param('roomId') roomId: string,
  ) {
    return this.studiosService.deleteRoom(req.user.userId, studioId, roomId);
  }
}