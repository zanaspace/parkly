import type { AttendEvent, SyncResult } from '@parkly/contracts';

/** An event waiting on this phone to be synced (doc 03 §3.7). */
export type QueuedEvent = AttendEvent;

/** Something the server applied with a warning, or refused: shown in A-06. */
export type SyncProblem = SyncResult & { type: QueuedEvent['type'] };

/** Oldest first; the server applies events in the order sent. */
export function nextBatch(queue: readonly QueuedEvent[], max: number): QueuedEvent[] {
  return queue.slice(0, max);
}

/**
 * Events are never dropped until the server says APPLIED, DUPLICATE or
 * CONFLICT (conflicts are recorded on the server, just flagged). REJECTED
 * events leave the queue too, but are kept as problems for the attendant.
 */
export function applyResults(
  queue: readonly QueuedEvent[],
  results: readonly SyncResult[],
): { queue: QueuedEvent[]; problems: SyncProblem[] } {
  const answered = new Map(results.map((r) => [r.clientEventId, r]));
  const problems: SyncProblem[] = [];
  const left: QueuedEvent[] = [];
  for (const e of queue) {
    const r = answered.get(e.clientEventId);
    if (!r) left.push(e);
    else if (r.result === 'CONFLICT' || r.result === 'REJECTED')
      problems.push({ ...r, type: e.type });
  }
  return { queue: left, problems };
}
