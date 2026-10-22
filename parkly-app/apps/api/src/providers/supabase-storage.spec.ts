import { describe, expect, it } from 'vitest';
import { supabaseStorage } from './supabase-storage.js';

type Call = { url: string; method: string; headers: Headers; body: unknown };

function fakeFetch(respond: (call: Call) => Response) {
  const calls: Call[] = [];
  const fn = (async (url: string | URL | Request, init?: RequestInit) => {
    const call = {
      url: String(url),
      method: init?.method ?? 'GET',
      headers: new Headers(init?.headers),
      body: init?.body,
    };
    calls.push(call);
    return respond(call);
  }) as typeof fetch;
  return { fn, calls };
}

const KEY = 'sb_secret_test_key_000000000000';
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

const make = (respond: (call: Call) => Response) => {
  const f = fakeFetch(respond);
  return {
    storage: supabaseStorage({ url: 'https://proj.supabase.co/', secretKey: KEY, fetch: f.fn }),
    calls: f.calls,
  };
};

describe('Supabase Storage adapter', () => {
  it('creates a signed upload URL for an API-chosen path, with the secret key', async () => {
    const { storage, calls } = make(() =>
      json(200, { url: '/object/upload/sign/kyb-docs/op%201/doc.pdf?token=abc', token: 'abc' }),
    );
    expect(
      await storage.createSignedUploadUrl({ bucket: 'kyb-docs', path: 'op 1/doc.pdf' }),
    ).toEqual({
      url: 'https://proj.supabase.co/storage/v1/object/upload/sign/kyb-docs/op%201/doc.pdf?token=abc',
      token: 'abc',
    });
    expect(calls[0]?.url).toBe(
      'https://proj.supabase.co/storage/v1/object/upload/sign/kyb-docs/op%201/doc.pdf',
    );
    expect(calls[0]?.method).toBe('POST');
    expect(calls[0]?.headers.get('apikey')).toBe(KEY);
    expect(calls[0]?.headers.get('authorization')).toBe(`Bearer ${KEY}`);
  });

  it('reads the token from the URL when the response omits it', async () => {
    const { storage } = make(() =>
      json(200, { url: '/object/upload/sign/permits/p.pdf?token=t1' }),
    );
    expect((await storage.createSignedUploadUrl({ bucket: 'permits', path: 'p.pdf' })).token).toBe(
      't1',
    );
  });

  it('creates a short-lived signed download URL', async () => {
    const { storage, calls } = make(() =>
      json(200, { signedURL: '/object/sign/permits/p.pdf?token=dl' }),
    );
    expect(
      await storage.createSignedDownloadUrl({
        bucket: 'permits',
        path: 'p.pdf',
        expiresInSec: 300,
      }),
    ).toBe('https://proj.supabase.co/storage/v1/object/sign/permits/p.pdf?token=dl');
    expect(JSON.parse(String(calls[0]?.body))).toEqual({ expiresIn: 300 });
  });

  it('downloads bytes, and returns null for a missing object', async () => {
    const bytes = new Uint8Array([0x25, 0x50, 0x44, 0x46]);
    const { storage, calls } = make((c) =>
      c.url.endsWith('/missing.pdf')
        ? json(400, { statusCode: '404', error: 'not_found', message: 'Object not found' })
        : new Response(bytes, { status: 200 }),
    );
    expect(await storage.download({ bucket: 'permits', path: 'p.pdf' })).toEqual(bytes);
    expect(calls[0]?.url).toBe(
      'https://proj.supabase.co/storage/v1/object/authenticated/permits/p.pdf',
    );
    expect(await storage.download({ bucket: 'permits', path: 'missing.pdf' })).toBeNull();
  });

  it('uploads with upsert and the given content type', async () => {
    const { storage, calls } = make(() => json(200, { Key: 'lot-photos/a.webp' }));
    await storage.upload({
      bucket: 'lot-photos',
      path: 'a.webp',
      body: new Uint8Array([1, 2]),
      contentType: 'image/webp',
    });
    expect(calls[0]?.method).toBe('POST');
    expect(calls[0]?.headers.get('x-upsert')).toBe('true');
    expect(calls[0]?.headers.get('content-type')).toBe('image/webp');
  });

  it('removes objects by prefix list', async () => {
    const { storage, calls } = make(() => json(200, []));
    await storage.remove({ bucket: 'kyb-docs', paths: ['a.pdf', 'b.pdf'] });
    expect(calls[0]?.method).toBe('DELETE');
    expect(calls[0]?.url).toBe('https://proj.supabase.co/storage/v1/object/kyb-docs');
    expect(JSON.parse(String(calls[0]?.body))).toEqual({ prefixes: ['a.pdf', 'b.pdf'] });
  });

  it('errors name the operation and status only, never the key', async () => {
    const { storage } = make(() => json(500, { message: `bad key ${KEY}` }));
    const err = await storage.createSignedUploadUrl({ bucket: 'kyb-docs', path: 'x.pdf' }).then(
      () => null,
      (e: unknown) => e as Error,
    );
    expect(err?.message).toBe('storage sign-upload kyb-docs failed: HTTP 500');
  });

  it('refuses paths that try to leave the bucket', async () => {
    const { storage, calls } = make(() => json(200, {}));
    await expect(
      storage.download({ bucket: 'kyb-docs', path: '../permits/x.pdf' }),
    ).rejects.toThrow('invalid storage path');
    expect(calls).toEqual([]);
  });
});

describe('public lot photo links', () => {
  it('builds a permanent CDN link without calling the API or exposing the key', () => {
    const { storage, calls } = make(() => json(500, {}));
    const url = storage.publicUrl({ bucket: 'lot-photos-public', path: 'lots/a b/1.webp' });
    expect(url).toBe(
      'https://proj.supabase.co/storage/v1/object/public/lot-photos-public/lots/a%20b/1.webp',
    );
    expect(url).not.toContain(KEY);
    expect(calls).toHaveLength(0);
  });
});
