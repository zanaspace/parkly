import type { PublicLot, Quote, Vehicle } from '@parkly/contracts';
import { formatNaira } from '@parkly/domain/money';
import { Text } from '@parkly/ui';
import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { randomUUID } from 'node:crypto';
import { AddCarForm, PayForm } from '../../../components/booking-forms';
import { api, apiAs, ApiProblem } from '../../../lib/api';
import { problemText } from '../../../lib/copy';
import { lineLabel, readSearch, searchQuery, searchWindow, windowLabel } from '../../../lib/search';
import { requireDriver } from '../../../lib/session';
import { createClient } from '../../../lib/supabase/server';

export const metadata: Metadata = { title: 'Review and pay · Parkly' };

type Params = Promise<{ lotId: string }>;
type Query = Promise<Record<string, string | string[] | undefined>>;

/** D-14 + D-15 on the web (doc 03 §1.4): car, server price, policies, then Paystack. */
export default async function ReviewAndPay({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: Query;
}) {
  const { lotId } = await params;
  const search = readSearch(await searchParams, new Date());
  const back = `/book/${lotId}?${searchQuery(search)}`;
  const driver = await requireDriver(back);
  const w = searchWindow(search);

  let lot: PublicLot;
  let quote: Quote;
  try {
    lot = await api<PublicLot>(`/v1/lots/${encodeURIComponent(lotId)}`);
    quote = await api<Quote>(`/v1/lots/${encodeURIComponent(lot.id)}/quote`, {
      method: 'POST',
      body: w,
    });
  } catch (err) {
    return (
      <main className="pk-page pk-stack">
        <p className="pk-notice pk-notice--error" role="alert">
          {problemText(err instanceof ApiProblem ? err.code : '')}
        </p>
        <Link className="pk-link" href="/search">
          Back to search
        </Link>
      </main>
    );
  }
  let vehicles: Vehicle[];
  try {
    vehicles = (await apiAs<{ items: Vehicle[] }>(driver.accessToken, '/v1/me/vehicles')).items;
  } catch (err) {
    if (err instanceof ApiProblem && (err.status === 401 || err.status === 403)) {
      const supabase = await createClient();
      await supabase.auth.signOut({ scope: 'local' });
      redirect(`/sign-in?next=${encodeURIComponent(back)}`);
    }
    throw err;
  }

  return (
    <main className="pk-page pk-stack">
      <Text variant="overline" tone="brand">
        Review and pay
      </Text>
      <Text variant="heading-xl" as="h1">
        {lot.name}
      </Text>
      <Text tone="secondary">{lot.addressLine}</Text>
      <Text variant="label-lg">{windowLabel(search)}</Text>

      <section className="pk-card pk-stack" aria-label="Price">
        <table className="pk-breakdown">
          <tbody>
            {quote.lines.map((l, i) => (
              <tr key={i}>
                <td>{lineLabel(l)}</td>
                <td>{formatNaira(l.amountKobo)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <th scope="row">Total</th>
              <td>{formatNaira(quote.totalKobo)}</td>
            </tr>
          </tfoot>
        </table>
      </section>

      <section className="pk-card pk-stack" aria-label="Car and payment">
        {vehicles.length === 0 ? (
          <>
            <Text variant="heading-md" as="h2">
              Add your car
            </Text>
            <AddCarForm back={back} />
          </>
        ) : (
          <PayForm
            window={{ lotId: lot.id, ...w }}
            vehicles={vehicles}
            idempotencyKey={randomUUID()}
            back={back}
            totalLabel={formatNaira(quote.totalKobo)}
          />
        )}
        <Text variant="body-sm" tone="tertiary">
          We hold your space for 10 minutes while you pay with card, bank transfer or USSD on
          Paystack. Free cancellation until 30 minutes before your start time.
        </Text>
      </section>
      <Link className="pk-link" href={`/lots/${lot.slug}?${searchQuery(search)}`}>
        Back to the car park
      </Link>
    </main>
  );
}
