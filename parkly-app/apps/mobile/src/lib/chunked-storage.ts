/**
 * Supabase sessions can exceed the ~2 KB SecureStore value limit, so values
 * are split across numbered keys. Doc 05 §4.4: tokens live only in secure
 * storage (Keychain / Android Keystore), never AsyncStorage.
 */
export type KeyValueStore = {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
};

export const CHUNK_SIZE = 1800;

/** SecureStore keys allow only [A-Za-z0-9._-]. */
export function safeKey(key: string): string {
  return key.replace(/[^A-Za-z0-9._-]/g, '_');
}

export function chunkedStorage(store: KeyValueStore): KeyValueStore {
  const countKey = (key: string) => `${safeKey(key)}.n`;
  const partKey = (key: string, i: number) => `${safeKey(key)}.${i}`;

  async function remove(key: string) {
    const n = Number((await store.getItem(countKey(key))) ?? 0);
    for (let i = 0; i < n; i++) await store.removeItem(partKey(key, i));
    await store.removeItem(countKey(key));
  }

  return {
    async getItem(key) {
      const raw = await store.getItem(countKey(key));
      if (raw === null) return null;
      const parts: string[] = [];
      for (let i = 0; i < Number(raw); i++) {
        const part = await store.getItem(partKey(key, i));
        if (part === null) return null; // partial write: treat as signed out
        parts.push(part);
      }
      return parts.join('');
    },
    async setItem(key, value) {
      await remove(key);
      const n = Math.max(1, Math.ceil(value.length / CHUNK_SIZE));
      for (let i = 0; i < n; i++) {
        await store.setItem(partKey(key, i), value.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE));
      }
      // Count last, so a crash mid-write never yields a truncated session.
      await store.setItem(countKey(key), String(n));
    },
    removeItem: remove,
  };
}

export function memoryStore(): KeyValueStore & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: async (k) => data.get(k) ?? null,
    setItem: async (k, v) => {
      data.set(k, v);
    },
    removeItem: async (k) => {
      data.delete(k);
    },
  };
}
