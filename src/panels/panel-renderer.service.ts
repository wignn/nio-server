import { Injectable } from '@nestjs/common';
import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, Guild, StringSelectMenuBuilder } from 'discord.js';

const BUTTON_STYLES: Record<string, ButtonStyle> = {
  PRIMARY: ButtonStyle.Primary,
  SECONDARY: ButtonStyle.Secondary,
  SUCCESS: ButtonStyle.Success,
  DANGER: ButtonStyle.Danger,
};

@Injectable()
export class PanelRendererService {
  render(panel: any, guild: Guild) {
    const embed = new EmbedBuilder()
      .setColor(parseInt((panel.color || '#5865F2').replace('#', ''), 16))
      .setTitle(panel.title || '✦ Self Roles')
      .setDescription(this.description(panel))
      .setAuthor({ name: guild.name, iconURL: guild.iconURL({ size: 128 }) || undefined })
      .setFooter({ text: `${panel.roles?.length || 0} role tersedia · ${panel.mode}` })
      .setTimestamp();

    if (panel.thumbnailUrl) embed.setThumbnail(panel.thumbnailUrl);
    if (panel.imageUrl) embed.setImage(panel.imageUrl);

    return { embeds: [embed], components: this.components(panel) };
  }

  private description(panel: any) {
    const lines = [panel.accentText, panel.description, '✦ ━━━━━━━━━━━━━━━━━━━━━━ ✦'].filter(Boolean);
    for (const role of panel.roles || []) {
      lines.push(`${role.emoji || '✧'}  ✧ <@&${role.roleId}>${role.description ? ` — ${role.description}` : ''}`);
    }
    return lines.join('\n');
  }

  private components(panel: any) {
    const roles = panel.roles || [];
    if (!roles.length) return [];
    if (panel.mode === 'MENU') {
      const menu = new StringSelectMenuBuilder()
        .setCustomId(`sr-menu:${panel.id}`)
        .setPlaceholder('✦ Pilih role yang kamu inginkan...')
        .addOptions(roles.slice(0, 25).map((role: any) => {
          const emoji = this.componentEmoji(role.emoji);
          return {
            label: role.label,
            value: role.roleId,
            description: role.description || `Toggle ${role.label}`,
            ...(emoji ? { emoji } : {}),
          };
        }));
      return [new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu)];
    }

    const rows: ActionRowBuilder<ButtonBuilder>[] = [];
    let row = new ActionRowBuilder<ButtonBuilder>();
    roles.forEach((role: any, index: number) => {
      const button = new ButtonBuilder()
        .setCustomId(`sr:${panel.id}:${role.roleId}`)
        .setLabel(role.label)
        .setStyle(BUTTON_STYLES[role.buttonStyle] || ButtonStyle.Secondary);
      const emoji = this.componentEmoji(role.emoji);
      if (emoji) button.setEmoji(emoji);
      row.addComponents(button);
      if ((index + 1) % 5 === 0) {
        rows.push(row);
        row = new ActionRowBuilder<ButtonBuilder>();
      }
    });
    if (row.components.length) rows.push(row);
    return rows;
  }

  private componentEmoji(emoji?: string | null) {
    const value = emoji?.trim();
    if (!value) return undefined;
    if (/^<a?:\w{2,32}:\d{17,20}>$/.test(value)) return value;
    if (/^(?:\p{Emoji_Presentation}|\p{Extended_Pictographic})$/u.test(value)) return value;
    return undefined;
  }
}
