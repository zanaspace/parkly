import { describe, expect, it } from 'vitest';
import { applyResults, nextBatch, type QueuedEvent } from './queue';

const ev = (id: string): QueuedEvent => ({
  type: 'WALK_IN',
  clientEventId: id,
  deviceTime: '2026-10-23T07:00:00.000Z',
  delta: 1,
});

describe('event queue (doc 03 §3.7)', () => {
  it('sends the oldest events first, at most a batch at a time', () => {
    const queue = Array.from({ length: 150 }, (_, i) => ev(`e${i}`));
    const batch = nextBatch(queue, 100);
    expect(batch).toHaveLength(100);
    expect(batch[0]?.clientEventId).toBe('e0');
    expect(nextBatch([], 100)).toEqual([]);
  });

  it('drops only events the server applied or already had; keeps the rest', () => {
    const queue = [ev('a'), ev('b'), ev('c'), ev('d'), ev('e')];
    const { queue: left, problems } = applyResults(queue, [
      { clientEventId: 'a', result: 'APPLIED', reason: null },
      { clientEventId: 'b', result: 'DUPLICATE', reason: 'ALREADY_SYNCED' },
      { clientEventId: 'c', result: 'CONFLICT', reason: 'ENTRY_AFTER_CANCEL' },
      { clientEventId: 'd', result: 'REJECTED', reason: 'UNKNOWN_BOOKING' },
    ]);
    // e had no answer (e.g. the batch was cut short): it stays queued.
    expect(left.map((e) => e.clientEventId)).toEqual(['e']);
    expect(problems).toEqual([
      { clientEventId: 'c', result: 'CONFLICT', reason: 'ENTRY_AFTER_CANCEL', type: 'WALK_IN' },
      { clientEventId: 'd', result: 'REJECTED', reason: 'UNKNOWN_BOOKING', type: 'WALK_IN' },
    ]);
  });
});
