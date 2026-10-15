/**
 * Drivers type numbers many ways ("0803 123 4567", "+234 803…"). OTPs are only
 * sent to Nigerian mobiles (doc 05 §4.1), so anything else is rejected here.
 * Nigerian mobile numbers: +234 then 10 digits starting 7, 8 or 9.
 */
const E164_NG_MOBILE = /^\+234[789]\d{9}$/;

export function normaliseNigerianPhone(input: string): string | null {
  const digits = input.replace(/[\s().-]/g, '');
  let e164: string;
  if (/^0\d{10}$/.test(digits)) e164 = `+234${digits.slice(1)}`;
  else if (/^234\d{10}$/.test(digits)) e164 = `+${digits}`;
  else e164 = digits;
  return E164_NG_MOBILE.test(e164) ? e164 : null;
}

/** For logs and UI: "+234******4567". */
export function maskPhone(phone: string): string {
  if (phone.length <= 7) return '*'.repeat(phone.length);
  return `${phone.slice(0, 4)}${'*'.repeat(phone.length - 8)}${phone.slice(-4)}`;
}
