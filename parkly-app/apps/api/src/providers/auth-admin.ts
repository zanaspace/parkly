/**
 * Supabase Auth admin calls the API needs with the secret key. Today only the
 * last step of account erasure (doc 06 section 6.1): removing the user from the
 * `auth` schema, which drops the phone, password hash, factors, sessions and
 * identities.
 */
export interface AuthAdmin {
  /** Deletes the Auth user. Already gone counts as done, so a retry is safe. */
  deleteUser(userId: string): Promise<void>;
}

export function supabaseAuthAdmin(options: {
  url: string;
  secretKey: string;
  fetch?: typeof fetch;
}): AuthAdmin {
  const doFetch = options.fetch ?? fetch;
  const base = options.url.replace(/\/$/, '');
  return {
    async deleteUser(userId) {
      const res = await doFetch(`${base}/auth/v1/admin/users/${encodeURIComponent(userId)}`, {
        method: 'DELETE',
        headers: { apikey: options.secretKey, authorization: `Bearer ${options.secretKey}` },
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok && res.status !== 404)
        throw new Error(`supabase delete user failed: HTTP ${res.status}`);
    },
  };
}

export class FakeAuthAdmin implements AuthAdmin {
  readonly deleted: string[] = [];
  /** Set to make the next call fail, to test that erasure waits and retries. */
  failNext = false;
  async deleteUser(userId: string) {
    if (this.failNext) {
      this.failNext = false;
      throw new Error('auth admin unavailable');
    }
    this.deleted.push(userId);
  }
}
