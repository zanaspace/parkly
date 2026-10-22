import type { CookieOptionsWithName } from '@supabase/ssr';

/**
 * Doc 05 §4.4: session cookies are Secure + SameSite=Lax and read only on the
 * server. All Supabase calls run in Server Components / Server Actions / proxy,
 * so the cookies can also be httpOnly — page scripts never see the tokens.
 */
export const authCookieOptions: CookieOptionsWithName = {
  path: '/',
  sameSite: 'lax',
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
};
