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

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type FinanceFilters = { from: string; to: string; lotId: string };

/**
 * The finance page's search params. Missing or malformed dates fall back to
 * this month so far; the API checks the range (at most 93 days).
 */
export function readFinanceFilters(
  params: Record<string, string | string[] | undefined>,
  now: number,
): FinanceFilters {
  const one = (k: string) => {
    const v = params[k];
    return typeof v === 'string' ? v : '';
  };
  const month = periodRange('month', now);
  return {
    from: DATE.test(one('from')) ? one('from') : month.from,
    to: DATE.test(one('to')) ? one('to') : month.to,
    lotId: UUID.test(one('lotId')) ? one('lotId') : '',
  };
}

/** Query string for the API and links, without an empty car park. */
export function financeQuery(f: FinanceFilters): string {
  const q = new URLSearchParams({ from: f.from, to: f.to });
  if (f.lotId) q.set('lotId', f.lotId);
  return q.toString();
}

/**
 * Months with a statement to download, newest first: this month (so far) back
 * to the month the operator joined, at most `max`.
 */
export function statementMonths(joinedIso: string | null, now: number, max = 12): string[] {
  const current = lagosKey(now).slice(0, 7);
  const joined = joinedIso ? lagosKey(Date.parse(joinedIso)).slice(0, 7) : null;
  const months: string[] = [];
  let [y = 0, m = 1] = current.split('-').map(Number);
  while (months.length < max) {
    const key = `${y}-${String(m).padStart(2, '0')}`;
    if (joined && key < joined) break;
    months.push(key);
    m -= 1;
    if (m === 0) {
      m = 12;
      y -= 1;
    }
  }
  return months;
}

/** "November 2026" for "2026-11". */
export function monthLabel(month: string): string {
  const [y = 0, m = 1] = month.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleString('en-GB', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}
