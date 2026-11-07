import type { CommissionRateList } from '@parkly/contracts';

type Rate = CommissionRateList['items'][number];

/** The `q` search param, trimmed and capped. */
export function readQuery(params: Record<string, string | string[] | undefined>): string {
  const v = params.q;
  return typeof v === 'string' ? v.trim().slice(0, 100) : '';
}

/**
 * Operators whose trading or legal name contains every word of the search,
 * ignoring case and accents. An empty search keeps everyone.
 */
export function filterRates(rates: readonly Rate[], query: string): Rate[] {
  const fold = (s: string) =>
    s
      .normalize('NFD')
      .replace(/\p{Diacritic}/gu, '')
      .toLowerCase();
  const words = fold(query).split(/\s+/).filter(Boolean);
  if (words.length === 0) return [...rates];
  return rates.filter((r) => {
    const name = fold(`${r.tradingName} ${r.legalName}`);
    return words.every((w) => name.includes(w));
  });
}
