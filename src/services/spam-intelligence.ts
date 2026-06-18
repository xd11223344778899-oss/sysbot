import { prisma } from '../database/prisma.js';

interface ChannelSample {
  ts: number;
  authorId: string;
  contentHash: string;
  botLineSent: boolean;
}

interface ChannelMetrics {
  emaRate: number;
  samples: ChannelSample[];
  lastBotLineAt: number;
  /** When the channel first looked calm while still suspended (for early resume). */
  calmSince: number;
}

const metrics = new Map<string, ChannelMetrics>();
const SUSPEND_BASE_MS = 5 * 60_000;
const SUSPEND_MAX_MS = 15 * 60_000;
const CALM_MS = 60_000;
const WINDOW_MS = 10_000;

function channelKey(guildId: string, channelId: string): string {
  return `${guildId}:${channelId}`;
}

function simpleHash(text: string): string {
  const t = text.trim().toLowerCase().slice(0, 120);
  let h = 0;
  for (let i = 0; i < t.length; i++) h = (h * 31 + t.charCodeAt(i)) | 0;
  return String(h);
}

function getMetrics(key: string): ChannelMetrics {
  let m = metrics.get(key);
  if (!m) {
    m = { emaRate: 0.5, samples: [], lastBotLineAt: 0, calmSince: 0 };
    metrics.set(key, m);
  }
  return m;
}

function pruneSamples(m: ChannelMetrics, now: number): void {
  m.samples = m.samples.filter((s) => now - s.ts < WINDOW_MS);
}

function activeSignals(m: ChannelMetrics, now: number): {
  velocitySpike: boolean;
  uniqueAuthorsBurst: boolean;
  repetitionScore: boolean;
  botAmplification: boolean;
} {
  pruneSamples(m, now);
  const count = m.samples.length;
  const instantRate = count / (WINDOW_MS / 1000);
  const velocitySpike = instantRate > Math.max(m.emaRate * 3, 4);

  const authors = new Set(m.samples.map((s) => s.authorId));
  const uniqueAuthorsBurst = authors.size >= 5 && count >= 6;

  const hashes = m.samples.map((s) => s.contentHash);
  const uniqueHashes = new Set(hashes).size;
  const repetitionScore = count >= 6 && uniqueHashes / count < 0.45;

  const recentBotLine = m.lastBotLineAt > 0 && now - m.lastBotLineAt < 5000;
  const botAmplification = recentBotLine && velocitySpike;

  return { velocitySpike, uniqueAuthorsBurst, repetitionScore, botAmplification };
}

function confidenceFromSignals(signals: ReturnType<typeof activeSignals>): number {
  let score = 0;
  if (signals.velocitySpike) score += 0.3;
  if (signals.uniqueAuthorsBurst) score += 0.25;
  if (signals.repetitionScore) score += 0.25;
  if (signals.botAmplification) score += 0.35;
  return Math.min(score, 1);
}

export async function loadStressStates(): Promise<void> {
  try {
    const now = Date.now();
    const rows = await prisma.channelStressState.findMany({
      where: { autoLineSuspendedUntil: { gt: new Date(now) } },
    });
    for (const row of rows) {
      const key = channelKey(row.guildId, row.channelId);
      const m = getMetrics(key);
      m.lastBotLineAt = row.updatedAt.getTime();
    }
  } catch {
    // Schema not ready yet — non-fatal on first deploy.
  }
}

export async function isAutoLineSuspended(guildId: string, channelId: string): Promise<boolean> {
  const row = await prisma.channelStressState.findUnique({
    where: { guildId_channelId: { guildId, channelId } },
  });
  if (!row?.autoLineSuspendedUntil) return false;
  if (row.autoLineSuspendedUntil.getTime() <= Date.now()) {
    await prisma.channelStressState.update({
      where: { guildId_channelId: { guildId, channelId } },
      data: { autoLineSuspendedUntil: null, lastConfidence: 0 },
    });
    return false;
  }
  return true;
}

export async function recordChannelMessage(
  guildId: string,
  channelId: string,
  authorId: string,
  content: string,
): Promise<void> {
  const key = channelKey(guildId, channelId);
  const m = getMetrics(key);
  const now = Date.now();
  pruneSamples(m, now);
  m.samples.push({ ts: now, authorId, contentHash: simpleHash(content), botLineSent: false });
  const instantRate = m.samples.length / (WINDOW_MS / 1000);
  m.emaRate = m.emaRate * 0.85 + instantRate * 0.15;

  const signals = activeSignals(m, now);
  const confidence = confidenceFromSignals(signals);
  const activeCount = Object.values(signals).filter(Boolean).length;

  if (confidence >= 0.75 && activeCount >= 2) {
    m.calmSince = 0;
    const existing = await prisma.channelStressState.findUnique({
      where: { guildId_channelId: { guildId, channelId } },
    });
    const suspendCount = (existing?.suspendCount ?? 0) + 1;
    const duration = Math.min(SUSPEND_BASE_MS * suspendCount, SUSPEND_MAX_MS);
    const until = new Date(now + duration);
    await prisma.channelStressState.upsert({
      where: { guildId_channelId: { guildId, channelId } },
      create: {
        guildId,
        channelId,
        autoLineSuspendedUntil: until,
        lastConfidence: confidence,
        suspendCount,
      },
      update: {
        autoLineSuspendedUntil: until,
        lastConfidence: confidence,
        suspendCount,
      },
    });
    return;
  }

  const isCalm = m.emaRate < 1.2 && m.samples.length < 3;
  if (!isCalm) {
    m.calmSince = 0;
  } else if (!m.calmSince) {
    m.calmSince = now;
  } else if (m.calmSince && now - m.calmSince >= CALM_MS) {
    const row = await prisma.channelStressState.findUnique({
      where: { guildId_channelId: { guildId, channelId } },
    });
    if (row?.autoLineSuspendedUntil && row.autoLineSuspendedUntil.getTime() > now) {
      m.calmSince = 0;
      await prisma.channelStressState.update({
        where: { guildId_channelId: { guildId, channelId } },
        data: { autoLineSuspendedUntil: null, lastConfidence: 0, suspendCount: 0 },
      });
    }
  }
}

export function markBotLineSent(guildId: string, channelId: string): void {
  const m = getMetrics(channelKey(guildId, channelId));
  m.lastBotLineAt = Date.now();
}

export async function countSuspendedChannels(): Promise<number> {
  return prisma.channelStressState.count({
    where: { autoLineSuspendedUntil: { gt: new Date() } },
  });
}
