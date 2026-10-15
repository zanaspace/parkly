/** Seconds to wait from a Retry-After header (seconds or HTTP date); fallback when absent. */
export function retryAfterSeconds(header: string | null, now: Date, fallback = 60): number {
  if (!header) return fallback;
  if (/^\d+$/.test(header.trim())) return Math.max(1, Number(header.trim()));
  const at = Date.parse(header);
  if (Number.isNaN(at)) return fallback;
  return Math.max(1, Math.ceil((at - now.getTime()) / 1000));
}

/** 75 → "1:15", 9 → "0:09". */
export function formatCountdown(seconds: number): string {
  const s = Math.max(0, Math.ceil(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
