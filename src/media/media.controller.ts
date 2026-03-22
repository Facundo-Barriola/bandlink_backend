import {
  BadRequestException,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
  Body,
} from '@nestjs/common';
import { Request } from 'express';
import { JwtAuthGuard } from 'src/auth/jwt-auth.guard';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname, join } from 'path';
import { mkdirSync } from 'fs';
import { randomUUID } from 'crypto';
import { MediaService } from './media.service';
import { UploadMediaDTO } from './dto/upload-media.dto';

const mediaStorage = diskStorage({
  destination: (_req, _file, cb) => {
    const uploadPath = join(process.cwd(), 'uploads', 'media');
    mkdirSync(uploadPath, { recursive: true });
    cb(null, uploadPath);
  },
  filename: (_req, file, cb) => {
    const safeExt = extname(file.originalname || '');
    cb(null, `${randomUUID()}${safeExt}`);
  },
});

@Controller('media')
export class MediaController {
  constructor(private readonly mediaService: MediaService) {}

  @Post('users/me')
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(FileInterceptor('file', { storage: mediaStorage }))
  uploadMyMedia(
    @Req() req: Request & { user: any },
    @UploadedFile() file: Express.Multer.File,
    @Body() dto: UploadMediaDTO,
  ) {
    if (!file) {
      throw new BadRequestException('Debes enviar un archivo');
    }

    return this.mediaService.uploadUserMedia(req.user.userId, file, dto);
  }

  @Get('users/me')
  @UseGuards(JwtAuthGuard)
  listMyMedia(@Req() req: Request & { user: any }) {
    return this.mediaService.listUserMedia(req.user.userId);
  }

  @Delete('users/me/:mediaId')
  @UseGuards(JwtAuthGuard)
  deleteMyMedia(
    @Req() req: Request & { user: any },
    @Param('mediaId', new ParseUUIDPipe()) mediaId: string,
  ) {
    return this.mediaService.deleteUserMedia(req.user.userId, mediaId);
  }

  @Post('studios/:studioId')
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(FileInterceptor('file', { storage: mediaStorage }))
  uploadStudioMedia(
    @Req() req: Request & { user: any },
    @Param('studioId', new ParseUUIDPipe()) studioId: string,
    @UploadedFile() file: Express.Multer.File,
    @Body() dto: UploadMediaDTO,
  ) {
    if (!file) {
      throw new BadRequestException('Debes enviar un archivo');
    }

    return this.mediaService.uploadStudioMedia(
      req.user.userId,
      studioId,
      file,
      dto,
    );
  }

  @Get('studios/:studioId')
  @UseGuards(JwtAuthGuard)
  listStudioMedia(
    @Param('studioId', new ParseUUIDPipe()) studioId: string,
  ) {
    return this.mediaService.listStudioMedia(studioId);
  }

  @Delete('studios/:studioId/:mediaId')
  @UseGuards(JwtAuthGuard)
  deleteStudioMedia(
    @Req() req: Request & { user: any },
    @Param('studioId', new ParseUUIDPipe()) studioId: string,
    @Param('mediaId', new ParseUUIDPipe()) mediaId: string,
  ) {
    return this.mediaService.deleteStudioMedia(
      req.user.userId,
      studioId,
      mediaId,
    );
  }

  @Post('rooms/:roomId')
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(FileInterceptor('file', { storage: mediaStorage }))
  uploadRoomMedia(
    @Req() req: Request & { user: any },
    @Param('roomId', new ParseUUIDPipe()) roomId: string,
    @UploadedFile() file: Express.Multer.File,
    @Body() dto: UploadMediaDTO,
  ) {
    if (!file) {
      throw new BadRequestException('Debes enviar un archivo');
    }

    return this.mediaService.uploadRoomMedia(req.user.userId, roomId, file, dto);
  }

  @Get('rooms/:roomId')
  @UseGuards(JwtAuthGuard)
  listRoomMedia(
    @Param('roomId', new ParseUUIDPipe()) roomId: string,
  ) {
    return this.mediaService.listRoomMedia(roomId);
  }

  @Delete('rooms/:roomId/:mediaId')
  @UseGuards(JwtAuthGuard)
  deleteRoomMedia(
    @Req() req: Request & { user: any },
    @Param('roomId', new ParseUUIDPipe()) roomId: string,
    @Param('mediaId', new ParseUUIDPipe()) mediaId: string,
  ) {
    return this.mediaService.deleteRoomMedia(req.user.userId, roomId, mediaId);
  }
}