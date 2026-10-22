'use client';

import type { Manifest } from '@parkly/contracts';
import type { StoredPin } from './pin';
import type { QueuedEvent, SyncProblem } from './queue';

/**
 * The attendant app's data on the phone (ADR 0005): the manifest, the event
 * queue and settings in IndexedDB, so the gate works for a whole shift
 * offline. Everything is wiped on sign-out, after 5 wrong PINs, or when a
 * manager blocks the phone.
 */

const DB = 'parkly-attend';
const VERSION = 1;

export type AttendSettings = {
  clientDeviceId: string;
  lotId: string | null;
  pin: StoredPin | null;
  pinTries: number;
  /** Server time − device time at the last manifest download (doc 03 §3.8). */
  clockOffsetMs: number;
  lastSyncAt: string | null;
  manifestAt: string | null;
};

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('kv')) db.createObjectStore('kv');
      if (!db.objectStoreNames.contains('queue'))
        db.createObjectStore('queue', { keyPath: 'clientEventId' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('IndexedDB unavailable'));
  });
}

async function run<T>(
  store: 'kv' | 'queue',
  mode: IDBTransactionMode,
  op: (s: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, mode);
    const req = op(tx.objectStore(store));
    tx.oncomplete = () => resolve(req.result);
    tx.onerror = () => reject(tx.error ?? new Error('IndexedDB write failed'));
  });
}

const get = <T>(key: string) => run<T | undefined>('kv', 'readonly', (s) => s.get(key));
const put = (key: string, value: unknown) => run('kv', 'readwrite', (s) => s.put(value, key));

export const attendStorage = {
  async settings(): Promise<AttendSettings> {
    const saved = await get<AttendSettings>('settings');
    if (saved) return saved;
    const fresh: AttendSettings = {
      clientDeviceId: crypto.randomUUID(),
      lotId: null,
      pin: null,
      pinTries: 0,
      clockOffsetMs: 0,
      lastSyncAt: null,
      manifestAt: null,
    };
    await put('settings', fresh);
    return fresh;
  },
  async saveSettings(patch: Partial<AttendSettings>): Promise<AttendSettings> {
    const next = { ...(await attendStorage.settings()), ...patch };
    await put('settings', next);
    return next;
  },
  manifest: (lotId: string) => get<Manifest>(`manifest:${lotId}`),
  saveManifest: (manifest: Manifest) => put(`manifest:${manifest.lot.id}`, manifest),
  problems: async () => (await get<SyncProblem[]>('problems')) ?? [],
  addProblems: async (more: SyncProblem[]) =>
    put('problems', [...(await attendStorage.problems()), ...more].slice(-200)),
  clearProblems: () => put('problems', []),

  /** Oldest first: client event ids are UUIDv7-like (time-ordered) from the app. */
  queue: async () =>
    (await run<QueuedEvent[]>('queue', 'readonly', (s) => s.getAll())).sort((a, b) =>
      a.deviceTime.localeCompare(b.deviceTime),
    ),
  enqueue: (event: QueuedEvent) => run('queue', 'readwrite', (s) => s.put(event)),
  async replaceQueue(events: QueuedEvent[]) {
    const db = await open();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('queue', 'readwrite');
      const store = tx.objectStore('queue');
      store.clear();
      for (const e of events) store.put(e);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error('IndexedDB write failed'));
    });
  },

  /** Removes every trace of Parkly data on this phone. */
  wipe: () =>
    new Promise<void>((resolve) => {
      const req = indexedDB.deleteDatabase(DB);
      req.onsuccess = req.onerror = req.onblocked = () => resolve();
    }),
};
