/** Money is always an integer number of kobo (doc 00 §3.4). Never floats. */
export type Kobo = number;

export function assertKobo(value: number): Kobo {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`Invalid kobo amount: ${value}`);
  }
  return value;
}

const PLAIN = /^\d+(\.\d{1,2})?$/;
const GROUPED = /^\d{1,3}(,\d{3})+(\.\d{1,2})?$/;

/** Parses operator/admin input such as "₦1,500.50" or 1500.5 into kobo. */
export function nairaToKobo(input: string | number): Kobo {
  const text = (typeof input === 'number' ? String(input) : input).trim().replace(/^₦\s*/, '');
  if (!PLAIN.test(text) && !GROUPED.test(text)) {
    throw new RangeError(`Invalid naira amount: ${JSON.stringify(input)}`);
  }
  const [whole = '0', frac = ''] = text.replace(/,/g, '').split('.');
  const kobo = BigInt(whole) * 100n + BigInt(frac.padEnd(2, '0'));
  return assertKobo(Number(kobo));
}

/**
 * round_half_up(a × b / c) using exact integer maths. Used for per-block prices
 * (rate × minutes / 60) and commission (price × bps / 10000), doc 02 §4.
 */
export function mulDivRoundHalfUp(a: number, b: number, c: number): number {
  for (const v of [a, b]) {
    if (!Number.isSafeInteger(v) || v < 0) throw new RangeError(`Invalid operand: ${v}`);
  }
  if (!Number.isSafeInteger(c) || c <= 0) throw new RangeError(`Invalid divisor: ${c}`);
  const big = BigInt(a) * BigInt(b);
  const divisor = BigInt(c);
  return assertKobo(Number((big * 2n + divisor) / (divisor * 2n)));
}

/** "₦1,500" or "₦1,500.50". Formats manually so web and Hermes render identically. */
export function formatNaira(kobo: Kobo): string {
  assertKobo(kobo);
  const whole = Math.floor(kobo / 100);
  const frac = kobo % 100;
  const grouped = String(whole).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return frac === 0 ? `₦${grouped}` : `₦${grouped}.${String(frac).padStart(2, '0')}`;
}
