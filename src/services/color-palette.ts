import { prisma } from '../database/prisma.js';

const DEFAULT_PALETTE: Record<string, string> = {
  أحمر: '#e74c3c',
  أزرق: '#3498db',
  أخضر: '#2ecc71',
  أصفر: '#f1c40f',
  بنفسجي: '#9b59b6',
  وردي: '#e91e63',
  برتقالي: '#e67e22',
  سماوي: '#1abc9c',
  ذهبي: '#f39c12',
  أبيض: '#ffffff',
};

export function getDefaultColorPalette(): Record<string, string> {
  return { ...DEFAULT_PALETTE };
}

/** Guild custom palette from antiCollection `colors`, merged over defaults. */
export async function getGuildColorPalette(guildId: string): Promise<Record<string, string>> {
  const row = await prisma.antiCollection.findUnique({
    where: { guildId_name: { guildId, name: 'colors' } },
  });
  if (!row) return getDefaultColorPalette();
  try {
    const parsed = JSON.parse(row.data) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return getDefaultColorPalette();
    }
    const custom: Record<string, string> = {};
    for (const [name, hex] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof hex === 'string' && /^#?[0-9a-fA-F]{6}$/.test(hex)) {
        custom[String(name)] = hex.startsWith('#') ? hex : `#${hex}`;
      }
    }
    return { ...DEFAULT_PALETTE, ...custom };
  } catch {
    return getDefaultColorPalette();
  }
}

export function resolveColorHex(palette: Record<string, string>, input: string): string | null {
  const fromName = palette[input];
  const hex = fromName ?? input;
  if (!/^#?[0-9a-fA-F]{6}$/.test(hex)) return null;
  return hex.startsWith('#') ? hex : `#${hex}`;
}

const MAX_JSON_BYTES = 8192;

export function assertJsonSize(serialized: string): boolean {
  return Buffer.byteLength(serialized, 'utf8') <= MAX_JSON_BYTES;
}
