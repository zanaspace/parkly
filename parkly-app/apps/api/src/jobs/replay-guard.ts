/** Records job call ids so a replayed signed request is a no-op. */
export interface ReplayGuard {
  /** True the first time `id` is seen within `ttlSec`. */
  firstSeen(id: string, ttlSec: number): Promise<boolean>;
}

/** Local dev and tests. Production uses the Upstash implementation. */
export class InMemoryReplayGuard implements ReplayGuard {
  private readonly seen = new Map<string, number>();

  constructor(private readonly nowMs: () => number = Date.now) {}

  async firstSeen(id: string, ttlSec: number): Promise<boolean> {
    const now = this.nowMs();
    const expiry = this.seen.get(id);
    if (expiry !== undefined && expiry > now) return false;
    this.seen.set(id, now + ttlSec * 1000);
    return true;
  }
}
