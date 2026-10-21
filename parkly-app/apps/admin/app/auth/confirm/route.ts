import type { EmailOtpType } from '@supabase/supabase-js';
import { redirect } from 'next/navigation';
import type { NextRequest } from 'next/server';
import { safeNext } from '../../../lib/auth/guard';
import { createClient } from '../../../lib/supabase/server';

const EMAIL_TYPES = new Set<EmailOtpType>([
  'recovery',
  'invite',
  'email',
  'email_change',
  'signup',
]);

/**
 * Landing route for Supabase email links (password recovery, staff invites).
 * Supports the PKCE `code` flow and the `token_hash` email-template flow.
 */
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const next = safeNext(url.searchParams.get('next'));
  const code = url.searchParams.get('code');
  const tokenHash = url.searchParams.get('token_hash');
  const type = url.searchParams.get('type') as EmailOtpType | null;
  const supabase = await createClient();

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) redirect(next);
  } else if (tokenHash && type && EMAIL_TYPES.has(type)) {
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    if (!error) redirect(type === 'invite' ? '/update-password' : next);
  }
  redirect('/reset-password?error=expired');
}
