import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { JwtAuthGuard } from 'src/auth/jwt-auth.guard';
import { BandsService } from './bands.service';
import { CreateBandDTO } from './dto/create-band.dto';
import { UpdateBandDTO } from './dto/update-band.dto';
import { CreateOpeningDTO } from './dto/create-opening.dto';
import { UpdateOpeningDTO } from './dto/update-opening.dto';

@Controller('bands')
export class BandsController {
  constructor(private readonly bandsService: BandsService) {}

  // --- Bandas ---

  @Post()
  @UseGuards(JwtAuthGuard)
  createBand(@Req() req: Request & { user: any }, @Body() dto: CreateBandDTO) {
    return this.bandsService.createBand(req.user.userId, dto);
  }

  @Get('mine')
  @UseGuards(JwtAuthGuard)
  getMyBands(@Req() req: Request & { user: any }) {
    return this.bandsService.getMyBands(req.user.userId);
  }

  @Get(':bandId')
  @UseGuards(JwtAuthGuard)
  getBand(@Param('bandId') bandId: string) {
    return this.bandsService.getBand(bandId);
  }

  @Patch(':bandId')
  @UseGuards(JwtAuthGuard)
  updateBand(
    @Req() req: Request & { user: any },
    @Param('bandId') bandId: string,
    @Body() dto: UpdateBandDTO,
  ) {
    return this.bandsService.updateBand(req.user.userId, bandId, dto);
  }

  @Delete(':bandId')
  @UseGuards(JwtAuthGuard)
  deleteBand(
    @Req() req: Request & { user: any },
    @Param('bandId') bandId: string,
  ) {
    return this.bandsService.deleteBand(req.user.userId, bandId);
  }

  // --- Miembros ---

  @Get(':bandId/members')
  @UseGuards(JwtAuthGuard)
  getMembers(@Param('bandId') bandId: string) {
    return this.bandsService.getMembers(bandId);
  }

  @Delete(':bandId/members/me')
  @UseGuards(JwtAuthGuard)
  leaveBand(
    @Req() req: Request & { user: any },
    @Param('bandId') bandId: string,
  ) {
    return this.bandsService.leaveBand(req.user.userId, bandId);
  }

  @Delete(':bandId/members/:memberId')
  @UseGuards(JwtAuthGuard)
  kickMember(
    @Req() req: Request & { user: any },
    @Param('bandId') bandId: string,
    @Param('memberId') memberId: string,
  ) {
    return this.bandsService.kickMember(req.user.userId, bandId, memberId);
  }

  // --- Convocatorias (Openings) ---

  @Post(':bandId/openings')
  @UseGuards(JwtAuthGuard)
  createOpening(
    @Req() req: Request & { user: any },
    @Param('bandId') bandId: string,
    @Body() dto: CreateOpeningDTO,
  ) {
    return this.bandsService.createOpening(req.user.userId, bandId, dto);
  }

  @Get(':bandId/openings')
  @UseGuards(JwtAuthGuard)
  getOpenings(@Param('bandId') bandId: string) {
    return this.bandsService.getOpenings(bandId);
  }

  @Patch(':bandId/openings/:openingId')
  @UseGuards(JwtAuthGuard)
  updateOpening(
    @Req() req: Request & { user: any },
    @Param('bandId') bandId: string,
    @Param('openingId') openingId: string,
    @Body() dto: UpdateOpeningDTO,
  ) {
    return this.bandsService.updateOpening(
      req.user.userId,
      bandId,
      openingId,
      dto,
    );
  }

  @Delete(':bandId/openings/:openingId')
  @UseGuards(JwtAuthGuard)
  deleteOpening(
    @Req() req: Request & { user: any },
    @Param('bandId') bandId: string,
    @Param('openingId') openingId: string,
  ) {
    return this.bandsService.deleteOpening(req.user.userId, bandId, openingId);
  }
}