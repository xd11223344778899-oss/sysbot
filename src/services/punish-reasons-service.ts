import {
  DEFAULT_PUNISH_REASONS,
  migrateLegacyReasons,
  parsePunishReasons,
  serializePunishReasons,
  type PunishApplicableType,
  type PunishReason,
} from '../shared/punish-reasons.js';
import { getGuildConfig, updateGuildConfig } from '../database/guild-config.js';

export async function getPunishReasons(guildId: string): Promise<PunishReason[]> {
  const cfg = await getGuildConfig(guildId);
  let reasons = parsePunishReasons(cfg.punishReasons);
  if (!reasons.length && cfg.reasons.length) {
    reasons = migrateLegacyReasons(cfg.reasons, reasons);
  }
  if (!reasons.length) {
    reasons = [...DEFAULT_PUNISH_REASONS];
  }
  return reasons;
}

export async function savePunishReasons(guildId: string, reasons: PunishReason[]): Promise<void> {
  await updateGuildConfig(guildId, { punishReasons: serializePunishReasons(reasons) });
}

export async function ensureDefaultPunishReasons(guildId: string): Promise<void> {
  const cfg = await getGuildConfig(guildId);
  const existing = parsePunishReasons(cfg.punishReasons);
  if (existing.length) return;
  const migrated = cfg.reasons.length ? migrateLegacyReasons(cfg.reasons, []) : [...DEFAULT_PUNISH_REASONS];
  await savePunishReasons(guildId, migrated);
}

export function filterReasonsForType(reasons: PunishReason[], type: PunishApplicableType): PunishReason[] {
  return reasons.filter((r) => r.types.includes(type));
}

export function formatDurationMs(ms: number | null): string {
  if (ms === null) return 'دائمة';
  if (ms >= 86_400_000) return `${Math.round(ms / 86_400_000)} يوم`;
  if (ms >= 3_600_000) return `${Math.round(ms / 3_600_000)} ساعة`;
  if (ms >= 60_000) return `${Math.round(ms / 60_000)} دقيقة`;
  return `${Math.round(ms / 1000)} ثانية`;
}
