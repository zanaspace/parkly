'use client';

import type { Lot, Product } from '@parkly/contracts';
import { Button, Input, Select, Text, ActionForm } from '@parkly/ui';
import { useRouter } from 'next/navigation';
import { useActionState, useRef, useState } from 'react';
import { putToSignedUrl, sha256Hex } from '../lib/browser-upload';
import { presignPermitDocument, saveRatePlan, submitLot, submitPermit } from '../lib/lots/actions';
import { priceLabel } from '../lib/lots/pricing';

const PERMIT_TYPES = ['application/pdf', 'image/jpeg', 'image/png'];

function Notice({ tone, children }: { tone: 'error' | 'info'; children: React.ReactNode }) {
  return (
    <p className={`pk-notice pk-notice--${tone}`} role={tone === 'error' ? 'alert' : 'status'}>
      {children}
    </p>
  );
}

const PERMIT_STATUS: Record<NonNullable<Lot['permit']>['status'], string> = {
  SUBMITTED: 'Submitted, awaiting review by Parkly',
  IN_REVIEW: 'Being reviewed by Parkly',
  APPROVED: 'Approved',
  REJECTED: 'Rejected',
  EXPIRED: 'Expired',
};

/** O-11 step 6: LASPA permit number, dates and a scan (PDF/JPG/PNG ≤ 10 MB). */
export function PermitSection(props: { operatorId: string; lot: Lot; editable: boolean }) {
  const router = useRouter();
  const fileInput = useRef<HTMLInputElement>(null);
  const form = useRef<HTMLFormElement>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const permit = props.lot.permit;
  const soon =
    permit && Date.parse(`${permit.expiresAt}T00:00:00+01:00`) - Date.now() < 30 * 24 * 3600 * 1000;

  async function submit() {
    setError(null);
    const data = new FormData(form.current ?? undefined);
    const permitNumber = String(data.get('permitNumber') ?? '').trim();
    const issuedAt = String(data.get('issuedAt') ?? '');
    const expiresAt = String(data.get('expiresAt') ?? '');
    const file = fileInput.current?.files?.[0];
    if (!permitNumber || !issuedAt || !expiresAt)
      return setError('Fill in the permit number and both dates.');
    if (!file) return setError('Attach a scan or photo of the permit.');
    if (!PERMIT_TYPES.includes(file.type)) return setError('Upload a PDF, JPG or PNG file.');
    if (file.size > 10 * 1024 * 1024) return setError('The file is larger than 10 MB.');
    try {
      setBusy('Uploading the permit…');
      const presign = await presignPermitDocument({
        operatorId: props.operatorId,
        lotId: props.lot.id,
        contentType: file.type,
        sizeBytes: file.size,
        sha256: await sha256Hex(file),
      });
      if (!presign.ok) return setError(presign.error);
      if (!(await putToSignedUrl(presign.uploadUrl, file)))
        return setError('The upload failed. Please check your connection and retry.');
      setBusy('Checking the file…');
      const done = await submitPermit({
        operatorId: props.operatorId,
        lotId: props.lot.id,
        fileId: presign.fileId,
        permitNumber,
        issuedAt,
        expiresAt,
      });
      if (!done.ok) return setError(done.error);
      form.current?.reset();
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="pk-card" aria-labelledby="permit-heading">
      <Text variant="label-lg" as="h3" id="permit-heading">
        LASPA permit
      </Text>
      {permit ? (
        <>
          <Text>
            {permit.permitNumber} · valid {permit.issuedAt} to {permit.expiresAt}
          </Text>
          <Text tone="secondary">{PERMIT_STATUS[permit.status]}</Text>
          {permit.rejectionReason && <Notice tone="error">Reason: {permit.rejectionReason}</Notice>}
          {soon && permit.status !== 'EXPIRED' && (
            <Notice tone="info">
              This permit expires within 30 days. Renew it with LASPA soon.
            </Notice>
          )}
        </>
      ) : (
        <Text tone="secondary">
          No permit yet. Lots can’t go live without a valid LASPA permit.
        </Text>
      )}
      {props.editable && (
        <form ref={form} className="pk-form" onSubmit={(e) => e.preventDefault()} noValidate>
          <Input label="Permit number" name="permitNumber" placeholder="LASPA/…" required />
          <div className="pk-row">
            <Input label="Issued on" name="issuedAt" type="date" required />
            <Input label="Expires on" name="expiresAt" type="date" required />
          </div>
          <label className="pk-visually-hidden" htmlFor="permit-file">
            Permit scan
          </label>
          <input
            ref={fileInput}
            id="permit-file"
            type="file"
            accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
          />
          <Button type="button" loading={busy !== null} onClick={submit}>
            {permit ? 'Upload a newer permit' : 'Submit permit'}
          </Button>
        </form>
      )}
      {busy && <Notice tone="info">{busy}</Notice>}
      {error && <Notice tone="error">{error}</Notice>}
    </section>
  );
}

const PRODUCTS: { product: Product; title: string; hint: string }[] = [
  { product: 'HOURLY', title: 'Hourly', hint: 'Charged per 15 minutes after the minimum stay.' },
  { product: 'DAILY', title: 'Daily', hint: 'One price for the whole day.' },
  { product: 'MONTHLY', title: 'Monthly pass', hint: 'One price per calendar month.' },
];

function PriceForm(props: { operatorId: string; lot: Lot; product: Product; editable: boolean }) {
  const [state, action, pending] = useActionState(saveRatePlan, undefined);
  return (
    <ActionForm action={action} className="pk-form" noValidate>
      <input type="hidden" name="operatorId" value={props.operatorId} />
      <input type="hidden" name="lotId" value={props.lot.id} />
      <input type="hidden" name="product" value={props.product} />
      <Input
        label={
          props.product === 'HOURLY'
            ? 'Price per hour (₦)'
            : props.product === 'DAILY'
              ? 'Price per day (₦)'
              : 'Price per month (₦)'
        }
        name="rate"
        inputMode="decimal"
        placeholder={
          props.product === 'HOURLY' ? '500' : props.product === 'DAILY' ? '2,500' : '45,000'
        }
        required
      />
      {props.product === 'HOURLY' && (
        <div className="pk-row">
          <Select
            label="Minimum stay"
            name="minMinutes"
            defaultValue="60"
            options={[30, 60, 120, 180, 240].map((m) => ({
              value: String(m),
              label: m < 60 ? `${m} minutes` : `${m / 60} hour${m > 60 ? 's' : ''}`,
            }))}
          />
          <Input
            label="Daily cap (₦), optional"
            name="dailyCap"
            inputMode="decimal"
            placeholder="3,000"
          />
        </div>
      )}
      {props.product === 'HOURLY' && (
        <div className="pk-row">
          <Input
            label="Overstay per 15 min (₦), optional"
            name="overstayRate"
            inputMode="decimal"
            placeholder="Hourly price ÷ 4"
            helper="Charged after the grace. Parkly allows up to 2× the hourly price per 15 minutes."
          />
          <Select
            label="Grace after the end"
            name="overstayGrace"
            defaultValue=""
            options={[
              { value: '', label: 'Standard (10 minutes)' },
              ...[15, 20, 30, 60].map((m) => ({ value: String(m), label: `${m} minutes` })),
            ]}
          />
        </div>
      )}
      {state?.error && <Notice tone="error">{state.error}</Notice>}
      {state?.saved && (
        <Notice tone="info">Sent for approval. It applies to new bookings once approved.</Notice>
      )}
      <Button type="submit" loading={pending}>
        Send price for approval
      </Button>
    </ActionForm>
  );
}

/** FR-LOT-005: hourly, daily and monthly prices, each approved by Parkly before use. */
export function PricesSection(props: { operatorId: string; lot: Lot; editable: boolean }) {
  return (
    <section className="pk-card" aria-labelledby="prices-heading">
      <Text variant="label-lg" as="h3" id="prices-heading">
        Prices
      </Text>
      <Text variant="body-sm" tone="tertiary">
        Set at least one. Every price is checked by Parkly before drivers see it, and changes apply
        to new bookings only.
      </Text>
      {PRODUCTS.map(({ product, title, hint }) => {
        const plans = props.lot.ratePlans.filter((p) => p.product === product);
        const active = plans.find((p) => p.status === 'ACTIVE');
        const pending = plans.find((p) => p.status === 'PENDING_APPROVAL');
        const rejected = plans.find((p) => p.status === 'REJECTED');
        return (
          <div key={product} className="pk-form">
            <Text variant="label-md" as="h4">
              {title}
            </Text>
            <Text variant="body-sm" tone="tertiary">
              {hint}
            </Text>
            {active && <Text>Live: {priceLabel(active)}</Text>}
            {pending && <Text tone="secondary">Awaiting approval: {priceLabel(pending)}</Text>}
            {rejected && (
              <Notice tone="error">
                Not approved: {priceLabel(rejected)}
                {rejected.rejectionReason ? ` · ${rejected.rejectionReason}` : ''}
              </Notice>
            )}
            {!active && !pending && !rejected && <Text tone="secondary">Not offered.</Text>}
            {props.editable && (
              <PriceForm operatorId={props.operatorId} lot={props.lot} product={product} editable />
            )}
          </div>
        );
      })}
    </section>
  );
}

/** Doc 02 §3.3: DRAFT → PENDING_VERIFICATION. */
export function SubmitLotSection(props: { operatorId: string; lot: Lot }) {
  const [state, action, pending] = useActionState(submitLot, undefined);
  if (props.lot.status !== 'DRAFT')
    return (
      <Text tone="secondary">
        {props.lot.status === 'PENDING_VERIFICATION'
          ? 'Submitted. Parkly will review the permit and arrange a site visit before the lot goes live.'
          : `Status: ${props.lot.status.replaceAll('_', ' ').toLowerCase()}.`}
      </Text>
    );
  return (
    <ActionForm action={action} className="pk-form">
      <input type="hidden" name="operatorId" value={props.operatorId} />
      <input type="hidden" name="lotId" value={props.lot.id} />
      {state?.error && (
        <Notice tone="error">
          {state.error}
          {state.missing && (
            <ul>
              {state.missing.map((m) => (
                <li key={m}>{m}</li>
              ))}
            </ul>
          )}
        </Notice>
      )}
      <Button type="submit" loading={pending} fullWidth>
        Submit lot for verification
      </Button>
    </ActionForm>
  );
}
