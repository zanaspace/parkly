'use client';

import type { AttendDevice, Manifest, SyncRequest, SyncResponse } from '@parkly/contracts';

/** A failed call; `offline` when the network (not the server) failed. */
export class AttendError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    readonly offline = false,
  ) {
    super(code);
  }
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/attend/api/${path}`, { ...init, cache: 'no-store' });
  } catch {
    throw new AttendError(0, 'OFFLINE', true);
  }
  const body = (await res.json().catch(() => null)) as { code?: string } | null;
  if (!res.ok) throw new AttendError(res.status, body?.code ?? 'UNKNOWN');
  return body as T;
}

const post = (body: unknown): RequestInit => ({
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body),
});

/** The attendant app's calls, through the portal's same-origin bridge. */
export const attendApi = {
  lots: () => call<{ items: { id: string; name: string; status: string }[] }>('lots'),
  register: (clientDeviceId: string, lotId: string) =>
    call<AttendDevice>('devices', post({ clientDeviceId, lotId })),
  manifest: (lotId: string, clientDeviceId: string) =>
    call<Manifest>(`manifest?${new URLSearchParams({ lotId, clientDeviceId }).toString()}`),
  sync: (body: SyncRequest) => call<SyncResponse>('sync', post(body)),
};
