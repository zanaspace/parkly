'use client';

import { Button, Input, Select, Text, ActionForm } from '@parkly/ui';
import { useActionState, useState } from 'react';
import { acceptInvite, decideDevice, inviteMember, removeMember } from '../lib/team/actions';
import { whatsappShare } from '../lib/team/copy';

function Notice({ tone, children }: { tone: 'error' | 'info'; children: React.ReactNode }) {
  return (
    <p className={`pk-notice pk-notice--${tone}`} role={tone === 'error' ? 'alert' : 'status'}>
      {children}
    </p>
  );
}

/** Shows the invite link once, with copy and WhatsApp share (no SMS until Termii is live). */
function InviteLink({
  link,
  name,
  businessName,
}: {
  link: string;
  name: string;
  businessName: string;
}) {
  const [copied, setCopied] = useState(false);
  return (
    <section className="pk-card" aria-live="polite">
      <Text variant="label-lg" as="h3">
        Invite ready for {name}
      </Text>
      <Text variant="body-sm" tone="secondary">
        Send them this link. It works once, for the email or phone number you entered, and expires
        in 72 hours. It won’t be shown again.
      </Text>
      <code className="pk-code">{link}</code>
      <div className="pk-row">
        <Button
          type="button"
          size="sm"
          onClick={async () => {
            await navigator.clipboard.writeText(link);
            setCopied(true);
          }}
        >
          {copied ? 'Copied' : 'Copy link'}
        </Button>
        <a
          className="pk-link"
          href={whatsappShare(link, businessName)}
          target="_blank"
          rel="noopener noreferrer"
        >
          Share on WhatsApp
        </a>
      </div>
    </section>
  );
}

/** O-20: invite a manager (email) or an attendant (phone, optionally limited to some lots). */
export function InviteForm(props: {
  operatorId: string;
  businessName: string;
  canInviteManager: boolean;
  lots: { id: string; name: string }[];
}) {
  const [state, action, pending] = useActionState(inviteMember, undefined);
  // A new invite link means success: start the next invite on a blank form.
  // An error leaves the key as it was, so what was typed stays.
  const [formKey, setFormKey] = useState('invite');
  if (state?.link && state.link !== formKey) setFormKey(state.link);
  const [role, setRole] = useState<'MANAGER' | 'ATTENDANT'>(
    props.canInviteManager ? 'MANAGER' : 'ATTENDANT',
  );
  const roles = [
    ...(props.canInviteManager
      ? [{ value: 'MANAGER', label: 'Manager: runs lots and the team in this portal' }]
      : []),
    { value: 'ATTENDANT', label: 'Attendant: checks cars in and out at the gate' },
  ];
  return (
    <>
      {state?.link && (
        <InviteLink link={state.link} name={state.name ?? ''} businessName={props.businessName} />
      )}
      <ActionForm key={formKey} action={action} className="pk-form">
        <input type="hidden" name="operatorId" value={props.operatorId} />
        <Select
          label="Role"
          name="role"
          options={roles}
          value={role}
          onChange={(e) => setRole(e.target.value as 'MANAGER' | 'ATTENDANT')}
        />
        <Input
          label="Their name"
          name="name"
          autoComplete="off"
          required
          error={state?.fieldErrors?.name}
        />
        {role === 'MANAGER' ? (
          <Input
            key="email"
            label="Their email address"
            name="contact"
            type="email"
            autoComplete="off"
            helper="They sign in to this portal with this email."
            required
            error={state?.fieldErrors?.contact}
          />
        ) : (
          <Input
            key="attendant"
            label="Their email address or phone number"
            name="contact"
            autoComplete="off"
            helper="Email for now (they sign up with it and a password); phone works once SMS is live."
            required
            error={state?.fieldErrors?.contact}
          />
        )}
        {role === 'ATTENDANT' && props.lots.length > 0 && (
          <fieldset className="pk-form">
            <legend className="pk-field__label">Lots they work (none ticked = all lots)</legend>
            {props.lots.map((l) => (
              <label key={l.id} className="pk-check">
                <input type="checkbox" name="lotIds" value={l.id} /> {l.name}
              </label>
            ))}
          </fieldset>
        )}
        {state?.error && <Notice tone="error">{state.error}</Notice>}
        <Button type="submit" loading={pending}>
          Create invite link
        </Button>
      </ActionForm>
    </>
  );
}

export function RemoveMemberButton(props: { operatorId: string; memberId: string; label: string }) {
  const [state, action, pending] = useActionState(removeMember, undefined);
  return (
    <ActionForm action={action}>
      <input type="hidden" name="operatorId" value={props.operatorId} />
      <input type="hidden" name="memberId" value={props.memberId} />
      <Button type="submit" variant="ghost" size="sm" loading={pending}>
        {props.label}
      </Button>
      {state?.error && <Notice tone="error">{state.error}</Notice>}
    </ActionForm>
  );
}

/** O-20 attendant phones: approve a new phone, or block one (its data is wiped). */
export function DeviceDecisionButton(props: {
  operatorId: string;
  deviceId: string;
  decision: 'approve' | 'revoke';
}) {
  const [state, action, pending] = useActionState(decideDevice, undefined);
  return (
    <ActionForm action={action}>
      <input type="hidden" name="operatorId" value={props.operatorId} />
      <input type="hidden" name="deviceId" value={props.deviceId} />
      <input type="hidden" name="decision" value={props.decision} />
      <Button
        type="submit"
        size="sm"
        variant={props.decision === 'approve' ? 'primary' : 'ghost'}
        loading={pending}
      >
        {props.decision === 'approve' ? 'Approve' : 'Block'}
      </Button>
      {state?.error && <Notice tone="error">{state.error}</Notice>}
    </ActionForm>
  );
}

export function AcceptInviteForm({ inviteToken }: { inviteToken: string }) {
  const [state, action, pending] = useActionState(acceptInvite, undefined);
  return (
    <ActionForm action={action} className="pk-form">
      <input type="hidden" name="inviteToken" value={inviteToken} />
      {state?.error && <Notice tone="error">{state.error}</Notice>}
      <Button type="submit" loading={pending} fullWidth>
        Accept invite
      </Button>
    </ActionForm>
  );
}
