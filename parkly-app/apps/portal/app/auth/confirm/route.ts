import type { EmailOtpType } from '@supabase/supabase-js';
import { redirect } from 'next/navigation';
import type { NextRequest } from 'next/server';
import { apiFetch } from '../../../lib/api';
import { getOrCreateDeviceId } from '../../../lib/auth/device';
import { safeNext } from '../../../lib/auth/guard';
import { publicEnv } from '../../../lib/env';
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

/** Same as after password sign-in: profile exists, this browser is recorded against the session. */
async function bootstrap(supabase: Awaited<ReturnType<typeof createClient>>) {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) return;
  try {
    await apiFetch(publicEnv().apiUrl, '/v1/auth/bootstrap', session.access_token, {
      method: 'POST',
      body: { deviceId: await getOrCreateDeviceId(), platform: 'WEB' },
    });
  } catch {
    // Non-fatal: the next page re-reads the profile, and sign-in bootstraps again.
  }
}
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const next = safeNext(url.searchParams.get('next'));
  const code = url.searchParams.get('code');
  const tokenHash = url.searchParams.get('token_hash');
  const type = url.searchParams.get('type') as EmailOtpType | null;
  const supabase = await createClient();

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      await bootstrap(supabase);
      redirect(next);
    }
  } else if (tokenHash && type && EMAIL_TYPES.has(type)) {
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    if (!error) {
      await bootstrap(supabase);
      redirect(type === 'invite' ? '/update-password' : next);
    }
  }
  redirect('/reset-password?error=expired');
}
