import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { world } from '../../test-helpers.js';

function setup() {
  const w = world();
  const fin = w.user([{ role: 'ADMIN_FINANCE', operatorId: null }], 'Finance');
  const asFin = { as: fin, aal: 'aal2' as const };
  return { w, fin, asFin };
}

describe('admin reconciliation endpoints (Sprint 7 Task 4)', () => {
  it('lists reconciliation runs with cursor pagination', async () => {
    const { w, asFin } = setup();

    // 0 runs initially
    const empty = await w.call('GET', '/v1/admin/reconciliation/runs', asFin);
    expect(empty.status).toBe(200);
    expect(empty.body?.runs).toEqual([]);
    expect(empty.body?.nextCursor).toBeNull();

    // Seed 3 runs
    const dates = ['2026-11-03', '2026-11-04', '2026-11-05'];
    for (const d of dates) {
      await w.store.reconciliation.saveRun({
        businessDate: d,
        provider: 'PAYSTACK',
        status: 'COMPLETED',
        totalInternal: 5,
        totalProvider: 5,
        matchedCount: 5,
        mismatchedCount: 0,
        startedAt: new Date(`${d}T06:00:00.000Z`),
        finishedAt: new Date(`${d}T06:01:00.000Z`),
        error: null,
      });
    }

    // Page 1: limit 2
    const p1 = await w.call('GET', '/v1/admin/reconciliation/runs?limit=2', asFin);
    expect(p1.status).toBe(200);
    expect(p1.body?.runs).toHaveLength(2);
    expect(p1.body?.nextCursor).toBeTruthy();

    // Page 2: with cursor
    const p2 = await w.call(
      'GET',
      `/v1/admin/reconciliation/runs?limit=2&cursor=${p1.body?.nextCursor as string}`,
      asFin,
    );
    expect(p2.status).toBe(200);
    expect(p2.body?.runs).toHaveLength(1);
    expect(p2.body?.nextCursor).toBeNull();

    // Invalid cursor returns 400
    const bad = await w.call(
      'GET',
      '/v1/admin/reconciliation/runs?cursor=not-a-valid-cursor',
      asFin,
    );
    expect(bad.status).toBe(400);

    const badDate = Buffer.from('not-a-date|id123', 'utf8').toString('base64url');
    expect(
      (await w.call('GET', `/v1/admin/reconciliation/runs?cursor=${badDate}`, asFin)).status,
    ).toBe(400);

    const emptyId = Buffer.from('2026-11-06T00:00:00.000Z|', 'utf8').toString('base64url');
    expect(
      (await w.call('GET', `/v1/admin/reconciliation/runs?cursor=${emptyId}`, asFin)).status,
    ).toBe(400);

    const emptyAt = Buffer.from('|id123', 'utf8').toString('base64url');
    expect(
      (await w.call('GET', `/v1/admin/reconciliation/runs?cursor=${emptyAt}`, asFin)).status,
    ).toBe(400);
  });

  it('gets reconciliation run details by id', async () => {
    const { w, asFin } = setup();

    // 404 for unknown run
    const notFound = await w.call('GET', `/v1/admin/reconciliation/runs/${randomUUID()}`, asFin);
    expect(notFound.status).toBe(404);

    // Run with null finishedAt
    const runningRun = await w.store.reconciliation.saveRun({
      businessDate: '2026-11-04',
      provider: 'PAYSTACK',
      status: 'RUNNING',
      totalInternal: 0,
      totalProvider: 0,
      matchedCount: 0,
      mismatchedCount: 0,
      startedAt: new Date('2026-11-06T05:59:00.000Z'),
      finishedAt: null,
      error: null,
    });
    const runningRes = await w.call('GET', `/v1/admin/reconciliation/runs/${runningRun.id}`, asFin);
    expect(runningRes.status).toBe(200);
    expect(runningRes.body?.finishedAt).toBeNull();

    const run = await w.store.reconciliation.saveRun({
      businessDate: '2026-11-05',
      provider: 'PAYSTACK',
      status: 'COMPLETED_WITH_EXCEPTIONS',
      totalInternal: 10,
      totalProvider: 10,
      matchedCount: 8,
      mismatchedCount: 2,
      startedAt: new Date('2026-11-06T06:00:00.000Z'),
      finishedAt: new Date('2026-11-06T06:02:00.000Z'),
      error: null,
    });

    const res = await w.call('GET', `/v1/admin/reconciliation/runs/${run.id}`, asFin);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      id: run.id,
      businessDate: '2026-11-05',
      provider: 'PAYSTACK',
      status: 'COMPLETED_WITH_EXCEPTIONS',
      totalInternal: 10,
      totalProvider: 10,
      matchedCount: 8,
      mismatchedCount: 2,
    });
  });

  it('lists reconciliation items with filtering by result and resolution status', async () => {
    const { w, asFin } = setup();

    // 404 if run not found
    const missingRun = await w.call(
      'GET',
      `/v1/admin/reconciliation/runs/${randomUUID()}/items`,
      asFin,
    );
    expect(missingRun.status).toBe(404);

    const run = await w.store.reconciliation.saveRun({
      businessDate: '2026-11-05',
      provider: 'PAYSTACK',
      status: 'COMPLETED_WITH_EXCEPTIONS',
      totalInternal: 4,
      totalProvider: 4,
      matchedCount: 2,
      mismatchedCount: 2,
      startedAt: new Date('2026-11-06T06:00:00.000Z'),
      finishedAt: new Date('2026-11-06T06:01:00.000Z'),
      error: null,
    });

    await w.store.reconciliation.saveItems(run.id, [
      {
        paymentId: randomUUID(),
        providerReference: 'ref-1',
        result: 'AMOUNT_MISMATCH',
        details: { reason: 'Amount mismatch' },
      },
      {
        paymentId: randomUUID(),
        providerReference: 'ref-2',
        result: 'MISSING_INTERNAL',
        details: { reason: 'Missing internally' },
      },
      {
        paymentId: randomUUID(),
        providerReference: 'ref-3',
        result: 'MATCHED',
        details: {},
      },
    ]);

    // All items
    const all = await w.call('GET', `/v1/admin/reconciliation/runs/${run.id}/items`, asFin);
    expect(all.status).toBe(200);
    expect(all.body?.items).toHaveLength(3);

    // Filter by result
    const filteredResult = await w.call(
      'GET',
      `/v1/admin/reconciliation/runs/${run.id}/items?result=AMOUNT_MISMATCH`,
      asFin,
    );
    expect(filteredResult.status).toBe(200);
    expect(filteredResult.body?.items).toHaveLength(1);
    expect((filteredResult.body?.items as { result: string }[])[0]?.result).toBe('AMOUNT_MISMATCH');

    // Resolve an item
    const firstItem = (all.body?.items as { id: string }[])[0];
    expect(firstItem).toBeDefined();
    const itemId = firstItem?.id ?? '';
    await w.call('POST', `/v1/admin/reconciliation/items/${itemId}/resolve`, {
      ...asFin,
      body: { notes: 'Investigated and marked as settled manual adjustment' },
    });

    // Filter unresolvedOnly
    const unresolved = await w.call(
      'GET',
      `/v1/admin/reconciliation/runs/${run.id}/items?unresolvedOnly=true`,
      asFin,
    );
    expect(unresolved.status).toBe(200);
    expect(unresolved.body?.items).toHaveLength(2);

    // Items cursor pagination
    const itemsP1 = await w.call(
      'GET',
      `/v1/admin/reconciliation/runs/${run.id}/items?limit=2`,
      asFin,
    );
    expect(itemsP1.status).toBe(200);
    expect(itemsP1.body?.items).toHaveLength(2);
    expect(itemsP1.body?.nextCursor).toBeTruthy();

    const itemsP2 = await w.call(
      'GET',
      `/v1/admin/reconciliation/runs/${run.id}/items?limit=2&cursor=${itemsP1.body?.nextCursor as string}`,
      asFin,
    );
    expect(itemsP2.status).toBe(200);
    expect(itemsP2.body?.items).toHaveLength(1);
    expect(itemsP2.body?.nextCursor).toBeNull();
  });

  it('resolves a reconciliation item and logs audit entry', async () => {
    const { w, asFin, fin } = setup();

    // 404 for unknown item
    const notFound = await w.call(
      'POST',
      `/v1/admin/reconciliation/items/${randomUUID()}/resolve`,
      { ...asFin, body: { notes: 'Some valid resolution notes' } },
    );
    expect(notFound.status).toBe(404);

    // 400 when notes too short (< 5 chars)
    const tooShort = await w.call(
      'POST',
      `/v1/admin/reconciliation/items/${randomUUID()}/resolve`,
      { ...asFin, body: { notes: 'bad' } },
    );
    expect(tooShort.status).toBe(400);

    const run = await w.store.reconciliation.saveRun({
      businessDate: '2026-11-05',
      provider: 'PAYSTACK',
      status: 'COMPLETED_WITH_EXCEPTIONS',
      totalInternal: 1,
      totalProvider: 1,
      matchedCount: 0,
      mismatchedCount: 1,
      startedAt: new Date('2026-11-06T06:00:00.000Z'),
      finishedAt: new Date('2026-11-06T06:01:00.000Z'),
      error: null,
    });

    await w.store.reconciliation.saveItems(run.id, [
      {
        paymentId: randomUUID(),
        providerReference: 'ref-err-1',
        result: 'STATUS_MISMATCH',
        details: { reason: 'Status mismatch' },
      },
    ]);

    const items = await w.store.reconciliation.listItems({ runId: run.id, limit: 1 });
    const item = items[0];
    expect(item).toBeDefined();
    if (!item) throw new Error('expected item');

    const resolveRes = await w.call('POST', `/v1/admin/reconciliation/items/${item.id}/resolve`, {
      ...asFin,
      body: { notes: 'Verified bank settlement directly with Paystack rep' },
    });
    expect(resolveRes.status).toBe(200);
    expect(resolveRes.body).toMatchObject({
      id: item.id,
      resolvedBy: fin,
      resolutionNotes: 'Verified bank settlement directly with Paystack rep',
    });
    expect(resolveRes.body?.resolvedAt).toBeTruthy();

    // Check audit row
    const auditRows = await w.store.audit.list({
      entityType: 'reconciliation_item',
      entityId: item.id,
      limit: 10,
    });
    expect(auditRows).toHaveLength(1);
    expect(auditRows[0]?.action).toBe('reconciliation.item_resolved');
    expect(auditRows[0]?.actorUserId).toBe(fin);

    // 404 if resolveItem returns null
    w.store.reconciliation.resolveItem = async () => null;
    const concurrentFail = await w.call(
      'POST',
      `/v1/admin/reconciliation/items/${item.id}/resolve`,
      { ...asFin, body: { notes: 'Another valid note' } },
    );
    expect(concurrentFail.status).toBe(404);
  });
});
