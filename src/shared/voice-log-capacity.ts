/** Formats voice channel occupancy like `5 / 10` or `3 / ∞`. */
export function formatChannelCapacity(current: number, userLimit: number): string {
  const limit = userLimit > 0 ? String(userLimit) : '∞';
  return `${current} / ${limit}`;
}
