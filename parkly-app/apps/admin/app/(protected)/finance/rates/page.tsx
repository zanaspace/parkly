import type { CommissionRateList } from '@parkly/contracts';
import { Text } from '@parkly/ui';
import { CommissionRates } from '../../../../components/commission-rates';
import { FinanceTabs } from '../../../../components/finance-tabs';
import { apiFetch } from '../../../../lib/api';
import { requireAccess } from '../../../../lib/auth/session';
import { publicEnv } from '../../../../lib/env';
import { filterRates, readQuery } from '../../../../lib/finance/rates';

export const metadata = { title: 'Commission rates · Parkly Admin' };

const RATE_SETTERS = new Set(['ADMIN_FINANCE', 'SUPER_ADMIN']);

/**
 * Every operator's commission (10–15%, 12% by default), searchable by name,
 * each with a form to change it. Changes apply to new bookings and are
 * audited with their reason (finance and super admin).
 */
export default async function CommissionRatesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { me, accessToken } = await requireAccess();
  const allowed = me.roles.some((r) => RATE_SETTERS.has(r.role));
  const query = readQuery(await searchParams);
  const all = allowed
    ? await apiFetch<CommissionRateList>(
        publicEnv().apiUrl,
        '/v1/admin/commission-rates',
        accessToken,
      )
        .then((r) => r.items)
        .catch(() => null)
    : null;

  return (
    <main className="pk-page pk-page--wide">
      <div>
        <Text variant="heading-xl">Commission rates</Text>
        <Text variant="body-sm" tone="secondary">
          10–15% per operator (12% by default). A change applies to bookings made from then on and
          is kept in the audit log with its reason.
        </Text>
      </div>

      {!allowed ? (
        <div className="pk-card">
          <Text variant="heading-md">Restricted Access</Text>
          <Text tone="secondary">Only finance and super admins can see and change rates.</Text>
        </div>
      ) : (
        <>
          <FinanceTabs active="rates" />
          <CommissionRates
            rates={all ? filterRates(all, query) : null}
            total={all?.length ?? 0}
            query={query}
          />
        </>
      )}
    </main>
  );
}
