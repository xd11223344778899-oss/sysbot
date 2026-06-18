const running = new Set<string>();

export function isHeavyJobRunning(guildId: string): boolean {
  return running.has(guildId);
}

export function getHeavyJobCount(): number {
  return running.size;
}

/**
 * Runs one heavy job per guild at a time. Returns false if guild is busy.
 */
export async function tryRunHeavyJob(
  guildId: string,
  job: () => Promise<void>,
): Promise<boolean> {
  if (running.has(guildId)) return false;
  running.add(guildId);
  try {
    await job();
    return true;
  } finally {
    running.delete(guildId);
  }
}

export const HEAVY_COMMAND_NAMES = new Set([
  'lsetup',
  'lremove',
  'rolemulti',
  'verifyall',
]);

export function isHeavyCommand(name: string): boolean {
  return HEAVY_COMMAND_NAMES.has(name.toLowerCase());
}
