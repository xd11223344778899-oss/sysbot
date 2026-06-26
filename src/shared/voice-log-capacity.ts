/** Formats voice channel occupancy like `5 / 10` or `3 / ∞`. */
export function formatChannelCapacity(current: number, userLimit: number): string {
  const limit = userLimit > 0 ? String(userLimit) : '∞';
  return `${current} / ${limit}`;
}

/** Left segment of capacity pill (current count, zero-padded). */
export function formatCapacityCount(n: number): string {
  return String(Math.max(0, n)).padStart(2, '0');
}

/** Right segment of capacity pill (limit or infinity). */
export function formatCapacityLimit(userLimit: number): string {
  return userLimit > 0 ? String(userLimit).padStart(2, '0') : '∞';
}
