import { Injectable } from '@nestjs/common';
import { PanelStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { DiscordBotService } from '../discord/discord-bot.service';
import { AppError } from '../common/errors/app-error';
import { CreatePanelDto } from './dto/create-panel.dto';
import { UpdatePanelDto } from './dto/update-panel.dto';
import { CreatePanelRoleDto } from './dto/create-panel-role.dto';
import { UpdatePanelRoleDto } from './dto/update-panel-role.dto';
import { ReorderPanelRolesDto } from './dto/reorder-panel-roles.dto';

@Injectable()
export class PanelsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly bot: DiscordBotService,
  ) {}

  list(guildId: string) {
    return this.prisma.panel.findMany({
      where: { guildId, status: { not: PanelStatus.ARCHIVED } },
      include: { roles: { orderBy: { position: 'asc' } } },
      orderBy: { updatedAt: 'desc' },
    });
  }

  async get(guildId: string, panelId: string) {
    const panel = await this.prisma.panel.findFirst({
      where: { id: panelId, guildId, status: { not: PanelStatus.ARCHIVED } },
      include: { roles: { orderBy: { position: 'asc' } } },
    });
    if (!panel) throw new AppError('PANEL_NOT_FOUND', 'Panel not found', 404);
    return panel;
  }

  async create(guildId: string, createdById: string, dto: CreatePanelDto) {
    // Pastikan Guild sudah terdaftar di database sebelum membuat panel (agar tidak melanggar foreign key constraint)
    const discordGuild = this.bot.client.guilds.cache.get(guildId) || await this.bot.client.guilds.fetch(guildId).catch(() => null);
    if (!discordGuild) throw new AppError('GUILD_NOT_FOUND', 'Discord server not found or bot is not in it', 404);

    await this.prisma.guild.upsert({
      where: { id: guildId },
      update: { name: discordGuild.name, icon: discordGuild.icon },
      create: { id: guildId, name: discordGuild.name, icon: discordGuild.icon },
    });

    return this.prisma.panel.create({
      data: {
        guildId,
        createdById,
        channelId: dto.channelId,
        name: dto.name,
        title: dto.title,
        accentText: dto.accentText,
        description: dto.description,
        type: dto.type || 'SELF_ROLE',
        mode: dto.mode,
        style: dto.style,
        color: dto.color || '#5865F2',
        imageUrl: dto.imageUrl,
        thumbnailUrl: dto.thumbnailUrl,
        requireRoleId: dto.requireRoleId,
        maxRoles: dto.maxRoles ?? 0,
      },
      include: { roles: true },
    });
  }

  async update(guildId: string, panelId: string, dto: UpdatePanelDto) {
    await this.get(guildId, panelId);
    return this.prisma.panel.update({
      where: { id: panelId },
      data: {
        channelId: dto.channelId,
        name: dto.name,
        title: dto.title,
        accentText: dto.accentText,
        description: dto.description,
        type: dto.type,
        mode: dto.mode,
        style: dto.style,
        color: dto.color,
        imageUrl: dto.imageUrl,
        thumbnailUrl: dto.thumbnailUrl,
        requireRoleId: dto.requireRoleId,
        maxRoles: dto.maxRoles,
      },
      include: { roles: { orderBy: { position: 'asc' } } },
    });
  }

  async archive(guildId: string, panelId: string) {
    await this.get(guildId, panelId);
    return this.prisma.panel.update({ where: { id: panelId }, data: { status: PanelStatus.ARCHIVED } });
  }

  async addRole(guildId: string, panelId: string, dto: CreatePanelRoleDto) {
    const panel = await this.get(guildId, panelId);
    if (panel.roles.length >= 25) throw new AppError('VALIDATION_ERROR', 'Maximum 25 roles per panel', 400);
    const maxPosition = panel.roles.reduce((max, role) => Math.max(max, role.position), -1);
    return this.prisma.panelRole.create({
      data: {
        panelId,
        roleId: dto.roleId,
        emoji: dto.emoji,
        label: dto.label,
        description: dto.description,
        buttonStyle: dto.buttonStyle,
        position: maxPosition + 1,
      },
    });
  }

  async updateRole(guildId: string, panelId: string, roleOptionId: string, dto: UpdatePanelRoleDto) {
    await this.get(guildId, panelId);

    const roleOption = await this.prisma.panelRole.findFirst({
      where: { id: roleOptionId, panelId },
    });
    if (!roleOption) throw new AppError('PANEL_ROLE_NOT_FOUND', 'Role option not found', 404);

    return this.prisma.panelRole.update({
      where: { id: roleOptionId },
      data: {
        roleId: dto.roleId,
        emoji: dto.emoji,
        label: dto.label,
        description: dto.description,
        buttonStyle: dto.buttonStyle,
      },
    });
  }

  async removeRole(guildId: string, panelId: string, roleOptionId: string) {
    await this.get(guildId, panelId);
    return this.prisma.panelRole.delete({ where: { id: roleOptionId } });
  }

  async reorderRoles(guildId: string, panelId: string, dto: ReorderPanelRolesDto) {
    const panel = await this.get(guildId, panelId);
    const currentIds = new Set(panel.roles.map((role) => role.id));
    const uniqueIds = new Set(dto.roleOptionIds);

    if (uniqueIds.size !== dto.roleOptionIds.length || uniqueIds.size !== currentIds.size) {
      throw new AppError('VALIDATION_ERROR', 'Role order must include every panel role exactly once', 400);
    }

    for (const roleOptionId of dto.roleOptionIds) {
      if (!currentIds.has(roleOptionId)) {
        throw new AppError('VALIDATION_ERROR', 'Role order contains role from another panel', 400);
      }
    }

    await this.prisma.$transaction(
      dto.roleOptionIds.map((roleOptionId, position) =>
        this.prisma.panelRole.update({ where: { id: roleOptionId }, data: { position } }),
      ),
    );

    return this.get(guildId, panelId);
  }

  async markPublished(guildId: string, panelId: string, messageId: string) {
    await this.get(guildId, panelId);
    return this.prisma.panel.update({
      where: { id: panelId },
      data: { messageId, status: 'PUBLISHED', lastPublishedAt: new Date() },
      include: { roles: { orderBy: { position: 'asc' } } },
    });
  }

  async markUnpublished(guildId: string, panelId: string) {
    await this.get(guildId, panelId);
    return this.prisma.panel.update({
      where: { id: panelId },
      data: { messageId: null, status: PanelStatus.DRAFT, lastPublishedAt: null },
      include: { roles: { orderBy: { position: 'asc' } } },
    });
  }

  async analytics(guildId: string) {
    const [adds, removes, recent, topRoles] = await Promise.all([
      this.prisma.roleLog.count({ where: { guildId, action: 'ADD' } }),
      this.prisma.roleLog.count({ where: { guildId, action: 'REMOVE' } }),
      this.prisma.roleLog.findMany({ where: { guildId }, orderBy: { createdAt: 'desc' }, take: 20 }),
      this.prisma.roleLog.groupBy({ by: ['roleId'], where: { guildId, action: 'ADD' }, _count: { roleId: true }, orderBy: { _count: { roleId: 'desc' } }, take: 10 }),
    ]);
    return { adds, removes, total: adds + removes, recent, topRoles };
  }
}
