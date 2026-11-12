/** Where the Terms and Privacy Notice are read (S8 task 8): the driver website, so one copy serves the app and the web. */
const DEFAULT_WEB_URL = 'https://parkly-web-two.vercel.app';

export type LegalPage = 'terms' | 'privacy';

export function legalUrl(
  page: LegalPage,
  base: string | undefined = process.env.EXPO_PUBLIC_WEB_URL,
): string {
  const root = (base && base.trim() ? base.trim() : DEFAULT_WEB_URL).replace(/\/+$/, '');
  return `${root}/legal/${page}`;
}
