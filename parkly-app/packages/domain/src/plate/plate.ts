/**
 * Nigerian plates come in several formats (standard "LND-123-AB", fleet,
 * government, diplomatic), so validation is deliberately lenient: after
 * normalisation, 5–10 ASCII letters/digits with at least one of each.
 */
export function normalisePlate(raw: string): string {
  return raw.toUpperCase().replace(/[\s.\-_/]/g, '');
}

const VALID_NORM = /^(?=.*[A-Z])(?=.*\d)[A-Z0-9]{5,10}$/;

export function isValidPlate(raw: string): boolean {
  return VALID_NORM.test(normalisePlate(raw));
}
