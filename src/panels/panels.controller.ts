import { Body, Controller, Delete, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { CurrentUser, SessionUser } from '../common/decorators/current-user.decorator';
import { SessionAuthGuard } from '../auth/guards/session-auth.guard';
import { GuildAccessGuard } from '../guilds/guards/guild-access.guard';
import { DiscordPublisherService } from './discord-publisher.service';
import { PanelsService } from './panels.service';
import { CreatePanelDto } from './dto/create-panel.dto';
import { UpdatePanelDto } from './dto/update-panel.dto';
import { CreatePanelRoleDto } from './dto/create-panel-role.dto';

@UseGuards(SessionAuthGuard, GuildAccessGuard)
@Controller('guilds/:guildId')
export class PanelsController {
  constructor(
    private readonly panels: PanelsService,
    private readonly publisher: DiscordPublisherService,
  ) {}

  @Get('panels')
  async list(@Param('guildId') guildId: string) {
    return { ok: true, panels: await this.panels.list(guildId) };
  }

  @Post('panels')
  async create(@Param('guildId') guildId: string, @CurrentUser() user: SessionUser, @Body() dto: CreatePanelDto) {
    return { ok: true, panel: await this.panels.create(guildId, user.id, dto) };
  }

  @Get('panels/:panelId')
  async get(@Param('guildId') guildId: string, @Param('panelId') panelId: string) {
    return { ok: true, panel: await this.panels.get(guildId, panelId) };
  }

  @Patch('panels/:panelId')
  async update(@Param('guildId') guildId: string, @Param('panelId') panelId: string, @Body() dto: UpdatePanelDto) {
    return { ok: true, panel: await this.panels.update(guildId, panelId, dto) };
  }

  @Delete('panels/:panelId')
  async archive(@Param('guildId') guildId: string, @Param('panelId') panelId: string) {
    return { ok: true, panel: await this.panels.archive(guildId, panelId) };
  }

  @Post('panels/:panelId/roles')
  async addRole(@Param('guildId') guildId: string, @Param('panelId') panelId: string, @Body() dto: CreatePanelRoleDto) {
    return { ok: true, role: await this.panels.addRole(guildId, panelId, dto) };
  }

  @Delete('panels/:panelId/roles/:roleOptionId')
  async removeRole(@Param('guildId') guildId: string, @Param('panelId') panelId: string, @Param('roleOptionId') roleOptionId: string) {
    return { ok: true, role: await this.panels.removeRole(guildId, panelId, roleOptionId) };
  }

  @Post('panels/:panelId/publish')
  async publish(@Param('guildId') guildId: string, @Param('panelId') panelId: string) {
    const panel = await this.panels.get(guildId, panelId);
    const message = await this.publisher.publish(panel);
    const updated = await this.panels.markPublished(guildId, panelId, message.id);
    return { ok: true, messageId: message.id, panel: updated };
  }

  @Get('analytics')
  async analytics(@Param('guildId') guildId: string) {
    return { ok: true, analytics: await this.panels.analytics(guildId) };
  }
}
