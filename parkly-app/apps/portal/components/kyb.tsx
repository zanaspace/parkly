'use client';

import type { Bank, KybDocument, KybDocumentType, PayoutAccount } from '@parkly/contracts';
import { Button, Input, Select, Text } from '@parkly/ui';
import { useRouter } from 'next/navigation';
import { useActionState, useRef, useState } from 'react';
import {
  completeKybDocument,
  deleteKybDocument,
  presignKybDocument,
  savePayoutAccount,
  submitKyb,
} from '../lib/operators/kyb-actions';
import { formatBytes } from '../lib/operators/kyb-copy';

const ACCEPTED = ['application/pdf', 'image/jpeg', 'image/png'];
const MAX_BYTES = 10 * 1024 * 1024;

function Notice({ tone, children }: { tone: 'error' | 'info'; children: React.ReactNode }) {
  return (
    <p className={`pk-notice pk-notice--${tone}`} role={tone === 'error' ? 'alert' : 'status'}>
      {children}
    </p>
  );
}

async function sha256Hex(file: File): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * One KYB document slot: the file goes from the browser straight to private
 * Supabase Storage through an API-issued signed URL (doc 05 V12); the API
 * then re-checks it before it counts.
 */
export function DocumentSlot(props: {
  operatorId: string;
  type: KybDocumentType;
  label: string;
  documents: KybDocument[];
  editable: boolean;
}) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function upload() {
    const file = input.current?.files?.[0];
    setError(null);
    if (!file) return setError('Choose a file first.');
    if (!ACCEPTED.includes(file.type)) return setError('Upload a PDF, JPG or PNG file.');
    if (file.size > MAX_BYTES) return setError('The file is larger than 10 MB.');
    try {
      setBusy('Preparing…');
      const presign = await presignKybDocument({
        operatorId: props.operatorId,
        type: props.type,
        contentType: file.type,
        sizeBytes: file.size,
        sha256: await sha256Hex(file),
      });
      if (!presign.ok) return setError(presign.error);
      setBusy('Uploading…');
      const put = await fetch(presign.uploadUrl, {
        method: 'PUT',
        headers: { 'content-type': file.type },
        body: file,
      });
      if (!put.ok) return setError('The upload failed. Please check your connection and retry.');
      setBusy('Checking the file…');
      const done = await completeKybDocument({
        operatorId: props.operatorId,
        fileId: presign.fileId,
        type: props.type,
      });
      if (!done.ok) return setError(done.error);
      if (input.current) input.current.value = '';
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="pk-card" aria-labelledby={`doc-${props.type}`}>
      <Text variant="label-lg" as="h3" id={`doc-${props.type}`}>
        {props.label}
      </Text>
      {props.documents.length === 0 && <Text tone="secondary">Not uploaded yet.</Text>}
      <ul className="pk-list">
        {props.documents.map((d) => (
          <li key={d.id} className="pk-row">
            <Text variant="body-sm">
              ✓ Uploaded {new Date(d.uploadedAt).toLocaleDateString('en-NG')} ·{' '}
              {d.mime === 'application/pdf' ? 'PDF' : 'Image'} · {formatBytes(d.sizeBytes)}
              {d.status === 'REJECTED' && ` · Rejected: ${d.rejectionReason ?? 'see email'}`}
            </Text>
            {props.editable && (
              <form action={deleteKybDocument}>
                <input type="hidden" name="operatorId" value={props.operatorId} />
                <input type="hidden" name="documentId" value={d.id} />
                <Button type="submit" variant="ghost" size="sm">
                  Remove
                </Button>
              </form>
            )}
          </li>
        ))}
      </ul>
      {props.editable && (
        <div className="pk-row">
          <label className="pk-visually-hidden" htmlFor={`file-${props.type}`}>
            Choose a file for {props.label}
          </label>
          <input
            ref={input}
            id={`file-${props.type}`}
            type="file"
            accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
          />
          <Button type="button" size="sm" loading={busy !== null} onClick={upload}>
            {props.documents.length > 0 ? 'Upload another' : 'Upload'}
          </Button>
        </div>
      )}
      {busy && <Notice tone="info">{busy}</Notice>}
      {error && <Notice tone="error">{error}</Notice>}
    </section>
  );
}

/** O-05: bank + NUBAN; the provider resolves the account name for confirmation. */
export function PayoutForm(props: {
  operatorId: string;
  banks: Bank[];
  account: PayoutAccount | null;
  editable: boolean;
}) {
  const [state, action, pending] = useActionState(savePayoutAccount, undefined);
  const account = state?.account ?? props.account;
  return (
    <section className="pk-card" aria-labelledby="payout-heading">
      <Text variant="label-lg" as="h3" id="payout-heading">
        Bank account for payouts
      </Text>
      {account && (
        <>
          <Text>
            {account.accountName} · {account.bankName} · ••••{account.accountNumberLast4}
          </Text>
          {!account.nameMatchesLegalName && (
            <Notice tone="info">
              This account name differs from your registered business name. You can still submit;
              our team will check it before approving.
            </Notice>
          )}
        </>
      )}
      {props.editable && (
        <form action={action} className="pk-form" noValidate>
          <input type="hidden" name="operatorId" value={props.operatorId} />
          <Select
            label="Bank"
            name="bankCode"
            defaultValue={account?.bankCode ?? ''}
            placeholder="Choose your bank"
            options={props.banks.map((b) => ({ value: b.code, label: b.name }))}
            required
          />
          <Input
            label="Account number"
            name="accountNumber"
            inputMode="numeric"
            maxLength={10}
            placeholder="10 digits"
            helper="We only keep the last 4 digits once your account is set up with Paystack."
            required
          />
          {state?.error && <Notice tone="error">{state.error}</Notice>}
          <Button type="submit" loading={pending}>
            {account ? 'Change bank account' : 'Check account'}
          </Button>
        </form>
      )}
    </section>
  );
}

export function SubmitKyb({ operatorId }: { operatorId: string }) {
  const [state, action, pending] = useActionState(submitKyb, undefined);
  return (
    <form action={action} className="pk-form">
      <input type="hidden" name="operatorId" value={operatorId} />
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
        Submit for review
      </Button>
    </form>
  );
}
