/**
 * Where the operator documents are read (S8 task 8): the Parkly website, so one copy serves every app.
 * Set `NEXT_PUBLIC_WEB_URL` in each environment; it defaults to the dev site.
 */
const DEFAULT_WEB_URL = 'https://parkly-web-two.vercel.app';

export type OperatorLegalPage = 'operators' | 'privacy' | 'terms';

export function legalUrl(
  page: OperatorLegalPage,
  base: string | undefined = process.env.NEXT_PUBLIC_WEB_URL,
  anchor?: string,
): string {
  const root = (base && base.trim() ? base.trim() : DEFAULT_WEB_URL).replace(/\/+$/, '');
  return `${root}/legal/${page}${anchor ? `#${anchor}` : ''}`;
}
