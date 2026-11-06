import { randomUUID } from 'node:crypto';
import { Writable } from 'node:stream';
import { describe, expect, it } from 'vitest';
import { createLogger } from '../lib/logger.js';
import { FakeSettlementProvider } from '../providers/fakes.js';
import type { ProviderSettlement } from '../providers/index.js';
import { MemoryStore } from '../store/memory.js';
import { settlementsSyncJob } from './settlements-sync.js';

const NOW = new Date('2026-11-06T10:00:00Z');
const FAR = new Date('2100-01-01T00:00:00Z');

async function setup() {
  const store = new MemoryStore();
  const provider = new FakeSettlementProvider();
  const owner = randomUUID();
  store.seedUser(owner, { roles: [] });
  const op = await store.operators.create({
    legalName: 'Eko Parking Ltd',
    tradingName: 'Eko Parking',
    type: 'HOTEL',
    cacNumberEnc: null,
    tinEnc: null,
    addressLine: null,
    contactEmail: null,
    contactPhoneEnc: null,
    ownerUserId: owner,
    commissionBps: 1200,
  });
  await store.payoutAccounts.upsert({
    operatorId: op.id,
    bankCode: '058',
    bankName: 'GTBank',
    accountNumberLast4: '6789',
    accountName: 'EKO PARKING LTD',
    pendingAccountNumberEnc: null,
    nameMismatch: false,
    verifiedAt: NOW,
  });
  await store.payoutAccounts.setSubaccount(op.id, 'ACCT_eko');
  Object.assign(store.payoutRows.get(op.id) ?? {}, { status: 'ACTIVE' });

  const lines: string[] = [];
  const logger = createLogger({
    level: 'info',
    stream: new Writable({ write: (c, _e, cb) => (lines.push(String(c)), cb()) }),
  });
  const job = settlementsSyncJob({ store, settlement: provider, logger, now: () => NOW });
  return { store, provider, op, job, lines };
}

const payout = (over: Partial<ProviderSettlement> = {}): ProviderSettlement => ({
  id: randomUUID(),
  status: 'SETTLED',
  amountKobo: 176_000,
  grossKobo: 180_000,
  feesKobo: 4_000,
  settledAt: new Date('2026-11-05T00:00:00Z'),
  subaccountCode: 'ACCT_eko',
  reviewReason: null,
  raw: {},
  ...over,
});

describe('settlements-sync job (S7 task 3)', () => {
  it('records the main account and each operator, posting each payout once', async () => {
    const t = await setup();
    const op = payout();
    const main = payout({ subaccountCode: null, amountKobo: 34_000 });
    t.provider.settlements.push(op, main);

    expect(await t.job({ payload: {}, deadline: FAR })).toEqual({ processed: 2, remaining: 0 });
    expect(t.store.settlementStore.rows.map((r) => [r.operatorId, r.status, !!r.postedAt])).toEqual(
      [
        [null, 'SETTLED', true],
        [t.op.id, 'SETTLED', true],
      ],
    );
    expect(t.store.settlementStore.ledgerRows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          account: 'CASH_AT_BANK',
          direction: 'DEBIT',
          amountKobo: 34_000,
        }),
        expect.objectContaining({
          account: `OPERATOR_PAYABLE:${t.op.id}`,
          direction: 'DEBIT',
          amountKobo: 176_000,
        }),
      ]),
    );

    // The next hour sees the same payouts: nothing new is posted.
    await t.job({ payload: {}, deadline: FAR });
    expect(t.store.settlementStore.ledgerRows).toHaveLength(4);
  });

  it('posts a pending payout when it is paid out later', async () => {
    const t = await setup();
    const p = payout({ status: 'PENDING' });
    t.provider.settlements.push(p);
    await t.job({ payload: {}, deadline: FAR });
    expect(t.store.settlementStore.ledgerRows).toHaveLength(0);
    Object.assign(p, { status: 'SETTLED' });
    await t.job({ payload: {}, deadline: FAR });
    expect(t.store.settlementStore.ledgerRows).toHaveLength(2);
  });

  it('holds a doubtful record for review and warns, without posting it', async () => {
    const t = await setup();
    t.provider.settlements.push(
      payout({ status: 'NEEDS_REVIEW', reviewReason: 'Currency is USD, not NGN' }),
    );
    await t.job({ payload: {}, deadline: FAR });
    expect(t.store.settlementStore.rows[0]).toMatchObject({
      status: 'NEEDS_REVIEW',
      reviewReason: 'Currency is USD, not NGN',
      postedAt: null,
    });
    expect(t.store.settlementStore.ledgerRows).toHaveLength(0);
    expect(t.lines.join('')).toContain('"level":40');
  });

  it('keeps going when one account fails, and reports it', async () => {
    const t = await setup();
    t.provider.settlements.push(payout());
    t.provider.failNext = true; // the main account's call fails
    expect(await t.job({ payload: {}, deadline: FAR })).toEqual({ processed: 1, remaining: 0 });
    expect(t.store.settlementStore.rows).toHaveLength(1);
    expect(t.lines.join('')).toContain('settlements.account_failed');
  });

  it('stops at the deadline and reports the accounts left', async () => {
    const t = await setup();
    expect(await t.job({ payload: {}, deadline: NOW })).toEqual({ processed: 0, remaining: 2 });
  });
});
