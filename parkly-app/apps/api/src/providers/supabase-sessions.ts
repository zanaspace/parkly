/** Ends Supabase Auth sessions (revokes refresh tokens server-side). */
export interface SessionRevoker {
  signOut(accessToken: string, scope: 'local' | 'global'): Promise<void>;
}

/** Calls GoTrue `/logout` with the user's own token (what `auth.admin.signOut` does). */
export function supabaseSessions(options: {
  url: string;
  apiKey: string;
  fetch?: typeof fetch;
}): SessionRevoker {
  const doFetch = options.fetch ?? fetch;
  const base = options.url.replace(/\/$/, '');
  return {
    async signOut(accessToken, scope) {
      const res = await doFetch(`${base}/auth/v1/logout?scope=${scope}`, {
        method: 'POST',
        headers: { apikey: options.apiKey, authorization: `Bearer ${accessToken}` },
        signal: AbortSignal.timeout(5_000),
      });
      // 401/404: the session is already gone, which is the outcome we want.
      if (!res.ok && res.status !== 401 && res.status !== 404) {
        throw new Error(`supabase logout failed: HTTP ${res.status}`);
      }
    },
  };
}

export class FakeSessionRevoker implements SessionRevoker {
  readonly calls: { accessToken: string; scope: 'local' | 'global' }[] = [];
  async signOut(accessToken: string, scope: 'local' | 'global') {
    this.calls.push({ accessToken, scope });
  }
}
