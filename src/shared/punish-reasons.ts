import type { PenaltyType } from './enums.js';

/** Penalty types plus kick (not stored as Penalty row). */
export type PunishApplicableType = PenaltyType | 'KICK';

export interface PunishReason {
  id: string;
  label: string;
  durationMs: number | null;
  types: PunishApplicableType[];
}

export const DEFAULT_PUNISH_REASONS: PunishReason[] = [
  {
    id: 'spam',
    label: 'سبام',
    durationMs: 30 * 60_000,
    types: ['MUTE', 'PRISON', 'VMUTE'],
  },
  {
    id: 'disturb',
    label: 'إزعاج',
    durationMs: 60 * 60_000,
    types: ['MUTE', 'PRISON', 'VMUTE'],
  },
  {
    id: 'profanity',
    label: 'ألفاظ غير لائقة',
    durationMs: 2 * 60 * 60_000,
    types: ['MUTE', 'PRISON', 'VMUTE'],
  },
  {
    id: 'ads',
    label: 'إعلان',
    durationMs: 24 * 60 * 60_000,
    types: ['MUTE', 'PRISON', 'BAN'],
  },
  {
    id: 'rules',
    label: 'مخالفة القوانين',
    durationMs: 60 * 60_000,
    types: ['MUTE', 'PRISON', 'VMUTE', 'BAN', 'KICK'],
  },
];

export function parsePunishReasons(json: string | null | undefined): PunishReason[] {
  if (!json) return [];
  try {
    const parsed = JSON.parse(json);
    if (!Array.isArray(parsed)) return [];
    return parsed as PunishReason[];
  } catch {
    return [];
  }
}

export function serializePunishReasons(reasons: PunishReason[]): string {
  return JSON.stringify(reasons);
}

/** Migrate legacy plain-string reasons into structured PunishReason rows. */
export function migrateLegacyReasons(legacy: string[], existing: PunishReason[]): PunishReason[] {
  if (existing.length) return existing;
  return legacy.map((label, i) => ({
    id: `legacy-${i}`,
    label,
    durationMs: null,
    types: ['MUTE', 'PRISON', 'VMUTE'] as PenaltyType[],
  }));
}
