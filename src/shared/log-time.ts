/** Formats like `4:22:1 AM - 2026/6/26` (no leading zeros on time parts). */
export function formatVoiceLogTime(date: Date): string {
  let hours = date.getHours();
  const minutes = date.getMinutes();
  const seconds = date.getSeconds();
  const ampm = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12;
  if (hours === 0) hours = 12;

  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  const day = date.getDate();

  return `${hours}:${minutes}:${seconds} ${ampm} - ${year}/${month}/${day}`;
}
