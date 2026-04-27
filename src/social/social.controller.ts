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
import { SocialService } from './social.service';
import { SendFriendRequestDTO } from './dto/send-friend-request.dto';
import { FollowDTO } from './dto/follow.dto';

@Controller('social')
export class SocialController {
  constructor(private readonly socialService: SocialService) {}

  @Post('friend-requests')
  @UseGuards(JwtAuthGuard)
  sendFriendRequest(
    @Req() req: Request & { user: any },
    @Body() dto: SendFriendRequestDTO,
  ) {
    return this.socialService.sendFriendRequest(req.user.userId, dto);
  }

  @Get('friend-requests/received')
  @UseGuards(JwtAuthGuard)
  getReceivedRequests(@Req() req: Request & { user: any }) {
    return this.socialService.getReceivedRequests(req.user.userId);
  }

  @Get('friend-requests/sent')
  @UseGuards(JwtAuthGuard)
  getSentRequests(@Req() req: Request & { user: any }) {
    return this.socialService.getSentRequests(req.user.userId);
  }

  @Patch('friend-requests/:requestId/accept')
  @UseGuards(JwtAuthGuard)
  acceptRequest(
    @Req() req: Request & { user: any },
    @Param('requestId') requestId: string,
  ) {
    return this.socialService.acceptRequest(req.user.userId, requestId);
  }

  @Patch('friend-requests/:requestId/reject')
  @UseGuards(JwtAuthGuard)
  rejectRequest(
    @Req() req: Request & { user: any },
    @Param('requestId') requestId: string,
  ) {
    return this.socialService.rejectRequest(req.user.userId, requestId);
  }

  @Delete('friend-requests/:requestId')
  @UseGuards(JwtAuthGuard)
  cancelRequest(
    @Req() req: Request & { user: any },
    @Param('requestId') requestId: string,
  ) {
    return this.socialService.cancelRequest(req.user.userId, requestId);
  }


  @Get('friends')
  @UseGuards(JwtAuthGuard)
  getMyFriends(@Req() req: Request & { user: any }) {
    return this.socialService.getMyFriends(req.user.userId);
  }

  @Delete('friends/:friendshipId')
  @UseGuards(JwtAuthGuard)
  removeFriendship(
    @Req() req: Request & { user: any },
    @Param('friendshipId') friendshipId: string,
  ) {
    return this.socialService.removeFriendship(req.user.userId, friendshipId);
  }


  @Post('follows')
  @UseGuards(JwtAuthGuard)
  follow(@Req() req: Request & { user: any }, @Body() dto: FollowDTO) {
    return this.socialService.follow(req.user.userId, dto);
  }

  @Get('follows')
  @UseGuards(JwtAuthGuard)
  getMyFollows(@Req() req: Request & { user: any }) {
    return this.socialService.getMyFollows(req.user.userId);
  }

  @Delete('follows/:targetType/:targetId')
  @UseGuards(JwtAuthGuard)
  unfollow(
    @Req() req: Request & { user: any },
    @Param('targetType') targetType: string,
    @Param('targetId') targetId: string,
  ) {
    return this.socialService.unfollow(req.user.userId, targetType, targetId);
  }
}