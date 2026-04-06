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
  Query
} from '@nestjs/common';
import { Request } from 'express';
import { JwtAuthGuard } from 'src/auth/jwt-auth.guard';
import { StudiosService } from './studios.service';
import { CreateStudioDTO } from './dto/create-studio.dto';
import { UpdateStudioDTO } from './dto/update-studio.dto';
import { CreateRoomDTO } from './dto/create-room.dto';
import { UpdateRoomDTO } from './dto/update-room.dto';
import { SearchStudiosDTO } from './dto/search-studio.dto';
import { CreateRoomAvailabilityRuleDTO } from './dto/create-room-availability-rule.dto';
import { UpdateRoomAvailabilityRuleDTO } from './dto/update-room-availability-rule.dto';
import { CreateRoomEquipmentDTO } from './dto/create-room-equipment.dto';
import { UpdateRoomEquipmentDTO } from './dto/update-room-equipment.dto';
import { CreateEquipmentDTO } from './dto/create-equipment.dto';
import { UpdateEquipmentDTO } from './dto/update-equipment.dto';
import { SearchEquipmentDTO } from './dto/search-equipment.dto';
import { GetRoomAvailabilityDTO } from './dto/get-room-availability.dto';

@Controller('studios')
export class StudiosController {
  constructor(private readonly studiosService: StudiosService) { }

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

  @Get('search')
  @UseGuards(JwtAuthGuard)
  searchStudiosByName(@Query() query: SearchStudiosDTO) {
    return this.studiosService.searchStudiosByName(query);
  }

  @Get('equipment/catalog')
  @UseGuards(JwtAuthGuard)
  getEquipmentCatalog(@Query() query: SearchEquipmentDTO) {
    return this.studiosService.getEquipmentCatalog(query);
  }

  @Get('equipment')
  @UseGuards(JwtAuthGuard)
  getEquipment(@Query() query: SearchEquipmentDTO) {
    return this.studiosService.getEquipment(query);
  }

  @Get('equipment/:equipmentId')
  @UseGuards(JwtAuthGuard)
  getEquipmentById(@Param('equipmentId') equipmentId: string) {
    return this.studiosService.getEquipmentById(equipmentId);
  }

  @Post('equipment')
  @UseGuards(JwtAuthGuard)
  createEquipment(@Body() dto: CreateEquipmentDTO) {
    return this.studiosService.createEquipment(dto);
  }

  @Patch('equipment/:equipmentId')
  @UseGuards(JwtAuthGuard)
  updateEquipment(
    @Param('equipmentId') equipmentId: string,
    @Body() dto: UpdateEquipmentDTO,
  ) {
    return this.studiosService.updateEquipment(equipmentId, dto);
  }

  @Delete('equipment/:equipmentId')
  @UseGuards(JwtAuthGuard)
  deleteEquipment(@Param('equipmentId') equipmentId: string) {
    return this.studiosService.deleteEquipment(equipmentId);
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

  @Get(':studioId/rooms/:roomId/availability')
@UseGuards(JwtAuthGuard)
getRoomAvailability(
  @Param('roomId') roomId: string,
  @Query() query: GetRoomAvailabilityDTO,
) {
  return this.studiosService.getRoomAvailability(
    roomId,
    query.date,
    query.durationMinutes,
    query.slotStepMinutes,
  );
}

  @Post(':studioId/rooms/:roomId/equipment')
  @UseGuards(JwtAuthGuard)
  addRoomEquipment(
    @Req() req: Request & { user: any },
    @Param('studioId') studioId: string,
    @Param('roomId') roomId: string,
    @Body() dto: CreateRoomEquipmentDTO,
  ) {
    return this.studiosService.addRoomEquipment(
      req.user.userId,
      studioId,
      roomId,
      dto,
    );
  }

  @Get(':studioId/rooms/:roomId/equipment')
  @UseGuards(JwtAuthGuard)
  getRoomEquipment(
    @Param('studioId') studioId: string,
    @Param('roomId') roomId: string,
  ) {
    return this.studiosService.getRoomEquipment(studioId, roomId);
  }

  @Patch(':studioId/rooms/:roomId/equipment/:equipmentId')
  @UseGuards(JwtAuthGuard)
  updateRoomEquipment(
    @Req() req: Request & { user: any },
    @Param('studioId') studioId: string,
    @Param('roomId') roomId: string,
    @Param('equipmentId') equipmentId: string,
    @Body() dto: UpdateRoomEquipmentDTO,
  ) {
    return this.studiosService.updateRoomEquipment(
      req.user.userId,
      studioId,
      roomId,
      equipmentId,
      dto,
    );
  }

  @Delete(':studioId/rooms/:roomId/equipment/:equipmentId')
  @UseGuards(JwtAuthGuard)
  deleteRoomEquipment(
    @Req() req: Request & { user: any },
    @Param('studioId') studioId: string,
    @Param('roomId') roomId: string,
    @Param('equipmentId') equipmentId: string,
  ) {
    return this.studiosService.deleteRoomEquipment(
      req.user.userId,
      studioId,
      roomId,
      equipmentId,
    );
  }

  @Post(':studioId/rooms/:roomId/availability-rules')
  @UseGuards(JwtAuthGuard)
  createRoomAvailabilityRule(
    @Req() req: Request & { user: any },
    @Param('studioId') studioId: string,
    @Param('roomId') roomId: string,
    @Body() dto: CreateRoomAvailabilityRuleDTO,
  ) {
    return this.studiosService.createRoomAvailabilityRule(
      req.user.userId,
      studioId,
      roomId,
      dto,
    );
  }

  @Get(':studioId/rooms/:roomId/availability-rules')
  @UseGuards(JwtAuthGuard)
  getRoomAvailabilityRules(
    @Param('studioId') studioId: string,
    @Param('roomId') roomId: string,
  ) {
    return this.studiosService.getRoomAvailabilityRules(studioId, roomId);
  }

  @Patch(':studioId/rooms/:roomId/availability-rules/:ruleId')
  @UseGuards(JwtAuthGuard)
  updateRoomAvailabilityRule(
    @Req() req: Request & { user: any },
    @Param('studioId') studioId: string,
    @Param('roomId') roomId: string,
    @Param('ruleId') ruleId: string,
    @Body() dto: UpdateRoomAvailabilityRuleDTO,
  ) {
    return this.studiosService.updateRoomAvailabilityRule(
      req.user.userId,
      studioId,
      roomId,
      ruleId,
      dto,
    );
  }

  @Delete(':studioId/rooms/:roomId/availability-rules/:ruleId')
  @UseGuards(JwtAuthGuard)
  deleteRoomAvailabilityRule(
    @Req() req: Request & { user: any },
    @Param('studioId') studioId: string,
    @Param('roomId') roomId: string,
    @Param('ruleId') ruleId: string,
  ) {
    return this.studiosService.deleteRoomAvailabilityRule(
      req.user.userId,
      studioId,
      roomId,
      ruleId,
    );
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