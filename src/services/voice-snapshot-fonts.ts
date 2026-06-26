import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { GlobalFonts } from '@napi-rs/canvas';

const FONTS_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'fonts');

export const SNAPSHOT_FONT = 'NotoSnapshot';
export const SNAPSHOT_FONT_BOLD = 'NotoSnapshotBold';

let registered = false;

/** Registers bundled Noto Sans for snapshot text (Latin + Arabic) on Linux/Railway. */
export function ensureSnapshotFonts(): void {
  if (registered) return;

  const regular = path.join(FONTS_DIR, 'NotoSans-Regular.ttf');
  const bold = path.join(FONTS_DIR, 'NotoSans-Bold.ttf');

  if (fs.existsSync(regular)) {
    GlobalFonts.registerFromPath(regular, SNAPSHOT_FONT);
  }
  if (fs.existsSync(bold)) {
    GlobalFonts.registerFromPath(bold, SNAPSHOT_FONT_BOLD);
  }

  registered = true;
}

export function snapshotFontBold(sizePx: number): string {
  ensureSnapshotFonts();
  return `${sizePx}px "${SNAPSHOT_FONT_BOLD}"`;
}

export function snapshotFontRegular(sizePx: number): string {
  ensureSnapshotFonts();
  return `${sizePx}px "${SNAPSHOT_FONT}"`;
}
