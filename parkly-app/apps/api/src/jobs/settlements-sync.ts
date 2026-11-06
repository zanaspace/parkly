import type { Logger } from '../lib/logger.js';
import type { SettlementProvider } from '../providers/index.js';
import type { SettlementRecord, Store } from '../store/types.js';
import type { JobHandler } from './routes.js';

/** Re-read this far back each run: late status changes are caught, repeats change nothing. */
export const SETTLEMENT_LOOKBACK_DAYS = 14;
const PER_PAGE = 50;
const MAX_PAGES = 20;
const DAY_MS = 24 * 60 * 60_000;

type Account = { operatorId: string | null; subaccount: string | null };

/**
 * S7 task 3, hourly (`settlements-sync`): lists the provider's payouts for
 * Parkly's main account and each operator subaccount over the last 14 days,
 * and records each one (`store.settlements.record`), which posts a paid-out
 * settlement to the ledger exactly once. One account failing doesn't stop
 * the others; accounts left when the deadline comes are reported as remaining
 * and picked up next hour.
 */
export function settlementsSyncJob(deps: {
  store: Store;
  settlement: SettlementProvider;
  logger: Logger;
  now: () => Date;
}): JobHandler {
  const provider = deps.settlement.name === 'paystack' ? 'PAYSTACK' : 'FAKE';

  return async ({ deadline }) => {
    const now = deps.now();
    const from = new Date(now.getTime() - SETTLEMENT_LOOKBACK_DAYS * DAY_MS);
    const accounts: Account[] = [
      { operatorId: null, subaccount: null },
      ...(await deps.store.payoutAccounts.activeSubaccounts()).map((a) => ({
        operatorId: a.operatorId,
        subaccount: a.subaccountCode,
      })),
    ];
    const tally = { seen: 0, new: 0, updated: 0, posted: 0, review: 0, unreadable: 0, failed: 0 };
    let processed = 0;

    for (const [i, account] of accounts.entries()) {
      if (deps.now() >= deadline) {
        deps.logger.info({ event: 'settlements.deadline', ...tally }, 'settlement sync paused');
        return { processed, remaining: accounts.length - i };
      }
      try {
        for (let page = 1; page <= MAX_PAGES; page++) {
          const res = await deps.settlement.listSettlements({
            subaccount: account.subaccount,
            from,
            to: now,
            page,
            perPage: PER_PAGE,
          });
          tally.unreadable += res.unreadable;
          for (const item of res.items) {
            tally.seen += 1;
            // A payout that names another subaccount is not this operator's: hold it.
            const wrongAccount =
              item.subaccountCode !== null && item.subaccountCode !== account.subaccount;
            const record: SettlementRecord = {
              provider,
              providerSettlementId: item.id,
              operatorId: account.operatorId,
              subaccountCode: item.subaccountCode ?? account.subaccount,
              status: wrongAccount ? 'NEEDS_REVIEW' : item.status,
              amountKobo: item.amountKobo,
              grossKobo: item.grossKobo,
              feesKobo: item.feesKobo,
              settledAt: item.settledAt,
              raw: item.raw,
              reviewReason: wrongAccount
                ? `Listed under ${account.subaccount ?? 'the main account'} but names ${item.subaccountCode}`
                : item.reviewReason,
            };
            const out = await deps.store.settlements.record(record, now);
            if (out.outcome === 'NEW') tally.new += 1;
            if (out.outcome === 'UPDATED') tally.updated += 1;
            if (out.posted) tally.posted += 1;
            if (record.status === 'NEEDS_REVIEW' && out.outcome !== 'UNCHANGED') tally.review += 1;
          }
          if (page >= res.pageCount) break;
        }
        processed += 1;
      } catch (err) {
        tally.failed += 1;
        deps.logger.error(
          {
            event: 'settlements.account_failed',
            operatorId: account.operatorId,
            error: err instanceof Error ? err.message : 'unknown',
          },
          'settlement sync failed for an account',
        );
      }
    }

    const level = tally.review > 0 || tally.unreadable > 0 || tally.failed > 0 ? 'warn' : 'info';
    deps.logger[level](
      { event: 'settlements.synced', accounts: accounts.length, ...tally },
      'settlements synced',
    );
    return { processed, remaining: 0 };
  };
}
