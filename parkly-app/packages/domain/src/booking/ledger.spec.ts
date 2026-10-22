import { describe, expect, it } from 'vitest';
import {
  LEDGER_ACCOUNTS,
  accountType,
  bookingPaymentJournal,
  isBalanced,
  operatorPayable,
  providerClearing,
  providerFeeJournal,
  refundJournal,
  type JournalLine,
} from './ledger.js';

const OP = '0199c1d2-0000-7000-8000-000000000001';

describe('ledger accounts (doc 02 §2.7)', () => {
  it('names per-operator and per-provider accounts', () => {
    expect(operatorPayable(OP)).toBe(`OPERATOR_PAYABLE:${OP}`);
    expect(providerClearing('PAYSTACK')).toBe('PROVIDER_CLEARING:PAYSTACK');
  });

  it('types every account', () => {
    expect(accountType(providerClearing('PAYSTACK'))).toBe('ASSET');
    expect(accountType(operatorPayable(OP))).toBe('LIABILITY');
    expect(accountType(LEDGER_ACCOUNTS.COMMISSION)).toBe('REVENUE');
    expect(accountType(LEDGER_ACCOUNTS.SERVICE_FEE)).toBe('REVENUE');
    expect(accountType(LEDGER_ACCOUNTS.PAYMENT_FEES)).toBe('EXPENSE');
    expect(accountType(LEDGER_ACCOUNTS.REFUNDS_CLEARING)).toBe('LIABILITY');
    expect(accountType(LEDGER_ACCOUNTS.DRIVER_RECEIVABLE)).toBe('ASSET');
  });
});

describe('booking payment journal', () => {
  it('posts the doc 02 worked example for ₦2,100 at 12%', () => {
    const lines = bookingPaymentJournal({
      provider: 'PAYSTACK',
      operatorId: OP,
      priceKobo: 200_000,
      serviceFeeKobo: 10_000,
      commissionBps: 1200,
    });
    expect(lines).toEqual([
      { account: 'PROVIDER_CLEARING:PAYSTACK', direction: 'DEBIT', amountKobo: 210_000 },
      { account: `OPERATOR_PAYABLE:${OP}`, direction: 'CREDIT', amountKobo: 176_000 },
      { account: 'PLATFORM_REVENUE_COMMISSION', direction: 'CREDIT', amountKobo: 24_000 },
      { account: 'PLATFORM_REVENUE_SERVICE_FEE', direction: 'CREDIT', amountKobo: 10_000 },
    ]);
    expect(isBalanced(lines)).toBe(true);
  });

  it('leaves out zero lines (no service fee on long stays)', () => {
    const lines = bookingPaymentJournal({
      provider: 'PAYSTACK',
      operatorId: OP,
      priceKobo: 500_000,
      serviceFeeKobo: 0,
      commissionBps: 1000,
    });
    expect(lines.map((l) => l.account)).not.toContain('PLATFORM_REVENUE_SERVICE_FEE');
    expect(isBalanced(lines)).toBe(true);
  });

  it('is balanced for every price, fee and commission (property)', () => {
    let seed = 7;
    const next = (max: number) => {
      seed = (seed * 1_103_515_245 + 12_345) % 2_147_483_648;
      return seed % max;
    };
    for (let i = 0; i < 2000; i++) {
      const lines = bookingPaymentJournal({
        provider: 'PAYSTACK',
        operatorId: OP,
        priceKobo: 1 + next(50_000_000),
        serviceFeeKobo: next(2) === 0 ? 0 : next(100_000),
        commissionBps: 1000 + next(501),
      });
      expect(isBalanced(lines)).toBe(true);
      for (const l of lines)
        expect(Number.isSafeInteger(l.amountKobo) && l.amountKobo > 0).toBe(true);
    }
  });

  it('posts the provider fee as an expense', () => {
    const lines = providerFeeJournal({ provider: 'PAYSTACK', feesKobo: 3_150 });
    expect(lines).toEqual([
      { account: 'PAYMENT_FEES_EXPENSE', direction: 'DEBIT', amountKobo: 3_150 },
      { account: 'PROVIDER_CLEARING:PAYSTACK', direction: 'CREDIT', amountKobo: 3_150 },
    ]);
    expect(providerFeeJournal({ provider: 'PAYSTACK', feesKobo: 0 })).toEqual([]);
  });

  it('reverses a full refund', () => {
    const paid = {
      provider: 'PAYSTACK' as const,
      operatorId: OP,
      priceKobo: 200_000,
      serviceFeeKobo: 10_000,
      commissionBps: 1200,
    };
    const lines = refundJournal(paid);
    expect(isBalanced(lines)).toBe(true);
    const net = new Map<string, number>();
    for (const l of [...bookingPaymentJournal(paid), ...lines]) {
      const sign = l.direction === 'DEBIT' ? 1 : -1;
      net.set(l.account, (net.get(l.account) ?? 0) + sign * l.amountKobo);
    }
    for (const [account, value] of net) expect(value, account).toBe(0);
  });
});

describe('balance check', () => {
  it('needs at least two lines and equal sides', () => {
    const dr: JournalLine = { account: 'A', direction: 'DEBIT', amountKobo: 100 };
    const cr: JournalLine = { account: 'B', direction: 'CREDIT', amountKobo: 100 };
    expect(isBalanced([dr, cr])).toBe(true);
    expect(isBalanced([dr])).toBe(false);
    expect(isBalanced([])).toBe(false);
    expect(isBalanced([dr, { ...cr, amountKobo: 99 }])).toBe(false);
    expect(isBalanced([dr, { ...cr, amountKobo: 0 }, { ...cr, amountKobo: 100 }])).toBe(false);
  });
});
