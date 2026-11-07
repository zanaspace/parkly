import type { CommissionRateList } from '@parkly/contracts';
import { Text } from '@parkly/ui';
import { percent } from '../lib/finance/period';
import { CommissionForm } from './commission-form';

/** Every operator's current rate, each with a form to change it (finance, super admin). */
export function CommissionRates({ rates }: { rates: CommissionRateList['items'] | null }) {
  return (
    <section aria-labelledby="rates-heading" className="pk-money">
      <Text variant="heading-md" as="h2" id="rates-heading">
        Commission rates
      </Text>
      <Text variant="body-sm" tone="secondary">
        10–15% per operator (12% by default). A change applies to bookings made from then on and is
        recorded in the audit log with its reason.
      </Text>
      {rates === null ? (
        <Text variant="body-sm" tone="secondary" role="status">
          We couldn’t load rates just now. Please refresh to try again.
        </Text>
      ) : rates.length === 0 ? (
        <Text variant="body-sm" tone="secondary">
          No operators yet.
        </Text>
      ) : (
        <ul className="pk-list pk-rates">
          {rates.map((r) => (
            <li key={r.operatorId} className="pk-card">
              <details>
                <summary className="pk-rates-summary">
                  <span>
                    <strong>{r.tradingName}</strong>
                    <Text as="span" variant="body-sm" tone="secondary">
                      {' '}
                      · {r.legalName} · KYB {r.kybStatus.toLowerCase().replace('_', ' ')}
                    </Text>
                  </span>
                  <span className="pk-badge pk-badge--verified">{percent(r.commissionBps)}</span>
                </summary>
                <CommissionForm operatorId={r.operatorId} currentBps={r.commissionBps} />
              </details>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
