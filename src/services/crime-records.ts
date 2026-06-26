import { EmbedBuilder } from 'discord.js';
import type { Penalty } from '@prisma/client';
import { baseEmbed } from '../shared/embeds.js';

const CRIMES_EMBED_COLOR = 0xed4245;
const FIELD_SEP = '-------';
const FIELD_MAX = 1024;

const PENALTY_TYPE_LABEL: Record<string, string> = {
  VMUTE: 'voice',
  MUTE: 'text',
  PRISON: 'prison',
  BLACKLIST: 'black',
  BAN: 'ban',
};

type CrimeGroup = 'mutes' | 'prisons' | 'blacklist';

const GROUP_TYPES: Record<CrimeGroup, string[]> = {
  mutes: ['MUTE', 'VMUTE'],
  prisons: ['PRISON'],
  blacklist: ['BLACKLIST', 'BAN'],
};

export function formatCrimeDate(date: Date): string {
  return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
}

function crimeTypeLabel(penalty: Penalty): string {
  return PENALTY_TYPE_LABEL[penalty.type] ?? penalty.type.toLowerCase();
}

function formatPenaltyEntry(index: number, penalty: Penalty): string {
  const reason = penalty.reason?.trim() || '—';
  return [
    `${index} - type: ${crimeTypeLabel(penalty)} | admin: <@${penalty.moderatorId}> | date: ${formatCrimeDate(penalty.createdAt)}`,
    `reason: ${reason}`,
  ].join('\n');
}

/** Newest entry gets the highest index; entries are listed newest-first. */
export function formatCrimeGroup(penalties: Penalty[]): string {
  if (!penalties.length) return '—';

  const ordered = [...penalties].sort(
    (a, b) => a.createdAt.getTime() - b.createdAt.getTime(),
  );
  const parts: string[] = [];

  for (let i = ordered.length - 1; i >= 0; i--) {
    const index = i + 1;
    if (parts.length) parts.push(FIELD_SEP);
    parts.push(formatPenaltyEntry(index, ordered[i]));
  }

  let text = parts.join('\n');
  if (text.length > FIELD_MAX) {
    text = `${text.slice(0, FIELD_MAX - 20).trimEnd()}\n…`;
  }
  return text;
}

function groupLabel(count: number, group: CrimeGroup): string {
  const labels: Record<CrimeGroup, string> = {
    mutes: 'mutes',
    prisons: 'prisons',
    blacklist: 'blacklist',
  };
  return `${count} ${labels[group]}:`;
}

export function buildCrimesEmbed(username: string, penalties: Penalty[]): EmbedBuilder {
  const grouped: Record<CrimeGroup, Penalty[]> = {
    mutes: [],
    prisons: [],
    blacklist: [],
  };

  for (const penalty of penalties) {
    for (const [group, types] of Object.entries(GROUP_TYPES) as [CrimeGroup, string[]][]) {
      if (types.includes(penalty.type)) {
        grouped[group].push(penalty);
        break;
      }
    }
  }

  return baseEmbed(CRIMES_EMBED_COLOR)
    .setTitle(`List of ${username}'s Crimes`)
    .addFields(
      {
        name: groupLabel(grouped.mutes.length, 'mutes'),
        value: formatCrimeGroup(grouped.mutes),
        inline: true,
      },
      {
        name: groupLabel(grouped.prisons.length, 'prisons'),
        value: formatCrimeGroup(grouped.prisons),
        inline: true,
      },
      {
        name: groupLabel(grouped.blacklist.length, 'blacklist'),
        value: formatCrimeGroup(grouped.blacklist),
        inline: true,
      },
    );
}
