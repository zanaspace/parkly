import { describe, expect, it, vi } from 'vitest';
import { supabaseAuthAdmin } from './auth-admin.js';

const id = '0192b6a0-0000-7000-8000-000000000001';

describe('supabase auth admin', () => {
  it('deletes the user with the secret key', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    await supabaseAuthAdmin({
      url: 'https://x.supabase.co/',
      secretKey: 'sb_secret_x',
      fetch,
    }).deleteUser(id);
    expect(fetch).toHaveBeenCalledWith(
      `https://x.supabase.co/auth/v1/admin/users/${id}`,
      expect.objectContaining({
        method: 'DELETE',
        headers: { apikey: 'sb_secret_x', authorization: 'Bearer sb_secret_x' },
      }),
    );
  });

  it('counts a user already gone as done, and fails on a real error', async () => {
    const gone = vi.fn().mockResolvedValue(new Response(null, { status: 404 }));
    await expect(
      supabaseAuthAdmin({ url: 'https://x.supabase.co', secretKey: 'k', fetch: gone }).deleteUser(
        id,
      ),
    ).resolves.toBeUndefined();
    const broken = vi.fn().mockResolvedValue(new Response(null, { status: 500 }));
    await expect(
      supabaseAuthAdmin({ url: 'https://x.supabase.co', secretKey: 'k', fetch: broken }).deleteUser(
        id,
      ),
    ).rejects.toThrow('HTTP 500');
  });
});
