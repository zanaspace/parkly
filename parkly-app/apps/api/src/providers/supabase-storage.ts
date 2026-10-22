import type { Bucket, StorageProvider } from './index.js';

/** Paths are chosen by the API; reject anything that could escape the bucket. */
function encodePath(path: string): string {
  const parts = path.split('/');
  if (path.startsWith('/') || parts.some((p) => p === '' || p === '.' || p === '..'))
    throw new Error('invalid storage path');
  return parts.map(encodeURIComponent).join('/');
}

/**
 * Supabase Storage over REST with the secret key (server-only, doc 05 §3).
 * Buckets are private; clients only ever get API-issued signed URLs.
 */
export function supabaseStorage(options: {
  url: string;
  secretKey: string;
  fetch?: typeof fetch;
  timeoutMs?: number;
}): StorageProvider {
  const doFetch = options.fetch ?? fetch;
  const base = `${options.url.replace(/\/$/, '')}/storage/v1`;
  const auth = { apikey: options.secretKey, authorization: `Bearer ${options.secretKey}` };

  async function request(
    url: string,
    init: { method: string; headers?: Record<string, string>; body?: RequestInit['body'] },
    timeoutMs = options.timeoutMs ?? 10_000,
  ): Promise<Response> {
    return doFetch(url, {
      method: init.method,
      headers: { ...auth, ...init.headers },
      ...(init.body !== undefined ? { body: init.body } : {}),
      signal: AbortSignal.timeout(timeoutMs),
    });
  }
  const fail = (op: string, bucket: Bucket, res: Response) =>
    new Error(`storage ${op} ${bucket} failed: HTTP ${res.status}`);

  return {
    publicUrl({ bucket, path }) {
      return `${base}/object/public/${bucket}/${encodePath(path)}`;
    },
    async createSignedUploadUrl({ bucket, path }) {
      const res = await request(`${base}/object/upload/sign/${bucket}/${encodePath(path)}`, {
        method: 'POST',
      });
      if (!res.ok) throw fail('sign-upload', bucket, res);
      const body = (await res.json()) as { url: string; token?: string };
      const url = `${base}${body.url}`;
      const token = body.token ?? new URL(url).searchParams.get('token') ?? '';
      return { url, token };
    },

    async createSignedDownloadUrl({ bucket, path, expiresInSec }) {
      const res = await request(`${base}/object/sign/${bucket}/${encodePath(path)}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ expiresIn: expiresInSec }),
      });
      if (!res.ok) throw fail('sign-download', bucket, res);
      const body = (await res.json()) as { signedURL: string };
      return `${base}${body.signedURL}`;
    },

    async download({ bucket, path }) {
      const res = await request(
        `${base}/object/authenticated/${bucket}/${encodePath(path)}`,
        { method: 'GET' },
        30_000,
      );
      // Storage answers a missing object with 400 + statusCode "404" (or a plain 404).
      if (res.status === 404 || res.status === 400) return null;
      if (!res.ok) throw fail('download', bucket, res);
      return new Uint8Array(await res.arrayBuffer());
    },

    async upload({ bucket, path, body, contentType }) {
      const res = await request(
        `${base}/object/${bucket}/${encodePath(path)}`,
        {
          method: 'POST',
          headers: { 'content-type': contentType, 'x-upsert': 'true' },
          body: Buffer.from(body),
        },
        30_000,
      );
      if (!res.ok) throw fail('upload', bucket, res);
    },

    async remove({ bucket, paths }) {
      for (const p of paths) encodePath(p);
      const res = await request(`${base}/object/${bucket}`, {
        method: 'DELETE',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ prefixes: paths }),
      });
      if (!res.ok) throw fail('remove', bucket, res);
    },
  };
}
