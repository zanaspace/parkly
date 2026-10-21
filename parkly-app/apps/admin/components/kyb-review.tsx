'use client';

import { Button, Text } from '@parkly/ui';
import { useActionState, useState } from 'react';
import { kybDocumentLink, reviewKyb } from '../lib/kyb/actions';

function Notice({ tone, children }: { tone: 'error' | 'info'; children: React.ReactNode }) {
  return (
    <p className={`pk-notice pk-notice--${tone}`} role={tone === 'error' ? 'alert' : 'status'}>
      {children}
    </p>
  );
}

/** Opens a private document in a new tab through a 5-minute link (audited by the API). */
export function OpenDocumentButton(props: { operatorId: string; documentId: string }) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function open() {
    setError(null);
    setBusy(true);
    // Open the tab inside the click so pop-up blockers allow it, then point it at the link.
    const tab = window.open('', '_blank');
    const res = await kybDocumentLink(props.operatorId, props.documentId);
    setBusy(false);
    if (!res.ok) {
      tab?.close();
      return setError(res.error);
    }
    if (tab) {
      tab.opener = null;
      tab.location.href = res.url;
    } else window.location.assign(res.url);
  }
  return (
    <>
      <Button type="button" variant="ghost" size="sm" loading={busy} onClick={open}>
        Open
      </Button>
      {error && <Notice tone="error">{error}</Notice>}
    </>
  );
}

/** Approve, or reject with a reason the operator will see. */
export function KybReviewForm({ operatorId }: { operatorId: string }) {
  const [state, action, pending] = useActionState(reviewKyb, undefined);
  return (
    <section className="pk-card" aria-labelledby="decision-heading">
      <Text variant="label-lg" as="h2" id="decision-heading">
        Decision
      </Text>
      <form action={action} className="pk-form">
        <input type="hidden" name="operatorId" value={operatorId} />
        <input type="hidden" name="decision" value="APPROVE" />
        <Text variant="body-sm" tone="tertiary">
          Approving creates the operator’s Paystack subaccount for payouts and activates the
          operator. It can’t be undone from here.
        </Text>
        <Button type="submit" loading={pending}>
          Approve KYB
        </Button>
      </form>
      <form action={action} className="pk-form">
        <input type="hidden" name="operatorId" value={operatorId} />
        <input type="hidden" name="decision" value="REJECT" />
        <label className="pk-field__label" htmlFor="reject-reason">
          Reason for rejecting (the operator sees this)
        </label>
        <textarea
          id="reject-reason"
          name="reason"
          className="pk-input"
          rows={3}
          minLength={5}
          maxLength={500}
        />
        <Button type="submit" variant="secondary" loading={pending}>
          Reject KYB
        </Button>
      </form>
      {state?.error && <Notice tone="error">{state.error}</Notice>}
    </section>
  );
}
