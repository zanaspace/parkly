'use client';

import { ActionForm, Button, Text } from '@parkly/ui';
import Link from 'next/link';
import { useActionState } from 'react';
import { setSelfCheckin } from '../lib/lots/actions';

/** ADR 0016: the owner lets drivers check themselves in by scanning the entrance poster. */
export function SelfCheckinSection(props: {
  operatorId: string;
  lotId: string;
  enabled: boolean;
  isOwner: boolean;
}) {
  const [state, action, pending] = useActionState(setSelfCheckin, undefined);
  return (
    <section className="pk-card">
      <Text tone="secondary">
        {props.enabled
          ? 'On: drivers with a booking can scan the poster at your entrance to check themselves in and out. They must be at the car park, within their booking time.'
          : 'Off: only you, your managers or your attendants check cars in. Turn it on if no one is at the entrance some of the time.'}
      </Text>
      {props.isOwner ? (
        <ActionForm action={action}>
          <input type="hidden" name="operatorId" value={props.operatorId} />
          <input type="hidden" name="lotId" value={props.lotId} />
          <input type="hidden" name="enabled" value={props.enabled ? 'false' : 'true'} />
          <Button type="submit" variant={props.enabled ? 'secondary' : 'primary'} loading={pending}>
            {props.enabled ? 'Turn self check-in off' : 'Turn self check-in on'}
          </Button>
          {state?.error && (
            <p className="pk-notice pk-notice--error" role="alert">
              {state.error}
            </p>
          )}
        </ActionForm>
      ) : (
        <Text variant="body-sm" tone="tertiary">
          Only the owner can switch this.
        </Text>
      )}
      {props.enabled && (
        <Link className="pk-link" href={`/lots/${props.lotId}/poster`}>
          Print the entrance poster
        </Link>
      )}
    </section>
  );
}

/** Opens the browser's print dialog for the poster page. */
export function PrintButton() {
  return (
    <Button type="button" className="pk-no-print" onClick={() => window.print()}>
      Print
    </Button>
  );
}
