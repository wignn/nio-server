import { Controller, Get, Post, Query, Req, Res, UseGuards } from '@nestjs/common';
import { Request, Response } from 'express';
import { randomBytes } from 'node:crypto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AppError } from '../common/errors/app-error';
import { SessionAuthGuard } from './guards/session-auth.guard';
import { AuthService } from './auth.service';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Get('discord')
  login(@Req() req: Request, @Res() res: Response) {
    const state = randomBytes(24).toString('hex');
    req.session.oauthState = state;
    return res.redirect(this.authService.getDiscordLoginUrl(state));
  }

  @Get('discord/callback')
  async callback(@Req() req: Request, @Res() res: Response, @Query('code') code?: string, @Query('state') state?: string) {
    if (!code) throw new AppError('OAUTH_CODE_MISSING', 'Missing OAuth code', 400);
    const isProd = process.env.NODE_ENV === 'production';
    if (!state || (isProd && state !== req.session.oauthState)) {
      throw new AppError('OAUTH_STATE_INVALID', 'Invalid OAuth state', 400);
    }

    const token = await this.authService.exchangeCode(code);
    const [discordUser, guilds] = await Promise.all([
      this.authService.fetchUser(token.access_token),
      this.authService.fetchGuilds(token.access_token),
    ]);

    const user = await this.authService.upsertUser(discordUser);
    req.session.user = {
      id: user.id,
      username: user.username,
      globalName: user.globalName,
      avatar: user.avatar,
      avatarUrl: this.authService.avatarUrl(user),
    };
    req.session.guilds = guilds;
    req.session.oauthState = undefined;

    return res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:3000'}/dashboard`);
  }

  @UseGuards(SessionAuthGuard)
  @Get('me')
  me(@CurrentUser() user: unknown, @Req() req: Request) {
    return { ok: true, user, guilds: req.session.guilds || [] };
  }

  @Post('logout')
  logout(@Req() req: Request, @Res() res: Response) {
    req.session.destroy(() => res.json({ ok: true }));
  }
}
