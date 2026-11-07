/** Lagos is UTC+1 all year. */
const LAGOS_OFFSET_MS = 60 * 60_000;
const DAY_MS = 24 * 60 * 60_000;

export const PERIODS = [
  { value: 'today', label: 'Today' },
  { value: 'week', label: 'This week' },
  { value: 'month', label: 'This month' },
  { value: '90d', label: 'Last 90 days' },
] as const;

export type Period = (typeof PERIODS)[number]['value'];

/** The `period` search param, or this month. */
export function readPeriod(params: Record<string, string | string[] | undefined>): Period {
  const v = params.period;
  return PERIODS.find((p) => p.value === v)?.value ?? 'month';
}

const lagosKey = (ms: number) => new Date(ms + LAGOS_OFFSET_MS).toISOString().slice(0, 10);

/**
 * Lagos dates `from`..`to` (inclusive) for the revenue report. Weeks start on
 * Monday. "Last 90 days" stays inside the API's 93-day limit, which is why
 * there's no "all time".
 */
export function periodRange(period: Period, now: number): { from: string; to: string } {
  const to = lagosKey(now);
  if (period === 'today') return { from: to, to };
  if (period === 'month') return { from: `${to.slice(0, 8)}01`, to };
  if (period === '90d') return { from: lagosKey(now - 89 * DAY_MS), to };
  const weekday = new Date(now + LAGOS_OFFSET_MS).getUTCDay(); // 0 = Sunday
  const sinceMonday = (weekday + 6) % 7;
  return { from: lagosKey(now - sinceMonday * DAY_MS), to };
}

/** "₦1,500.00" or "−₦15.05" from kobo, with no floating point. */
export function money(kobo: number): string {
  const abs = Math.abs(kobo);
  const whole = Math.trunc(abs / 100).toLocaleString('en-NG');
  return `${kobo < 0 ? '−' : ''}₦${whole}.${String(abs % 100).padStart(2, '0')}`;
}
