'use client';

import type { Lot } from '@parkly/contracts';
import { ActionForm, Button, Text } from '@parkly/ui';
import { useActionState } from 'react';
import { setLotVisibility } from '../lib/lots/actions';
import { EyeIcon, EyeOffIcon } from './icons';

interface LotVisibilitySectionProps {
  operatorId: string;
  lot: Lot;
  canManage: boolean;
}

export function LotVisibilitySection({ operatorId, lot, canManage }: LotVisibilitySectionProps) {
  const [state, action, pending] = useActionState(setLotVisibility, undefined);

  const isLive = lot.status === 'LIVE';
  const isPaused = lot.status === 'PAUSED';
  const isToggleable = isLive || isPaused;

  return (
    <section
      className="pk-card"
      style={{
        borderLeft: isLive
          ? '4px solid var(--pk-color-brand-primary, #137066)'
          : isPaused
            ? '4px solid #f59e0b'
            : undefined,
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          flexWrap: 'wrap',
          gap: '0.75rem',
          marginBottom: '0.75rem',
        }}
      >
        <div>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              marginBottom: '0.25rem',
            }}
          >
            {isLive ? (
              <EyeIcon size={20} style={{ color: 'var(--pk-color-brand-primary, #137066)' }} />
            ) : (
              <EyeOffIcon size={20} style={{ color: '#d97706' }} />
            )}
            <Text variant="heading-sm" as="h3">
              Search & Listing Visibility
            </Text>
          </div>
          <Text variant="body-sm" tone="secondary">
            Control whether drivers can discover and book this parking lot in search results.
          </Text>
        </div>

        <div>
          {isLive && (
            <span
              className="pk-badge pk-badge--verified"
              style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}
            >
              <span
                style={{
                  width: '7px',
                  height: '7px',
                  borderRadius: '50%',
                  background: '#10b981',
                  boxShadow: '0 0 6px rgba(16, 185, 129, 0.7)',
                }}
              />
              Visible in Search
            </span>
          )}
          {isPaused && (
            <span
              className="pk-badge pk-badge--pending"
              style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}
            >
              <span
                style={{
                  width: '7px',
                  height: '7px',
                  borderRadius: '50%',
                  background: '#f59e0b',
                }}
              />
              Hidden from Search
            </span>
          )}
          {lot.status === 'DRAFT' && (
            <span className="pk-badge pk-badge--neutral">Draft · Not Listed</span>
          )}
          {lot.status === 'PENDING_VERIFICATION' && (
            <span className="pk-badge pk-badge--pending">Under Review</span>
          )}
          {lot.status === 'SUSPENDED' && (
            <span className="pk-badge pk-badge--danger">Suspended</span>
          )}
        </div>
      </div>

      {isLive && (
        <div style={{ marginTop: '0.5rem' }}>
          <p
            style={{
              margin: '0 0 1rem 0',
              fontSize: '0.9rem',
              color: 'var(--pk-color-text-secondary)',
            }}
          >
            This parking facility is <strong>Live</strong>. Drivers can see it on the map, search by
            location, and complete bookings. If your lot is full or temporarily unavailable, pause
            visibility to hide it from search immediately.
          </p>

          {canManage ? (
            <ActionForm action={action}>
              <input type="hidden" name="operatorId" value={operatorId} />
              <input type="hidden" name="lotId" value={lot.id} />
              <input type="hidden" name="visible" value="false" />
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
                <Button
                  type="submit"
                  variant="secondary"
                  loading={pending}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}
                >
                  <EyeOffIcon size={16} />
                  <span>Pause Listing (Hide from Search)</span>
                </Button>
                <Text variant="body-sm" tone="tertiary">
                  Existing confirmed bookings will still be honoured.
                </Text>
              </div>
            </ActionForm>
          ) : (
            <Text variant="body-sm" tone="tertiary">
              Only operator owners and managers can pause or resume listing visibility.
            </Text>
          )}
        </div>
      )}

      {isPaused && (
        <div style={{ marginTop: '0.5rem' }}>
          <p
            style={{
              margin: '0 0 1rem 0',
              fontSize: '0.9rem',
              color: 'var(--pk-color-text-secondary)',
            }}
          >
            This parking facility is <strong>Paused</strong>. It is hidden from driver search
            results and new bookings are blocked. Arriving drivers with existing bookings can still
            check in at the gate.
          </p>

          {canManage ? (
            <ActionForm action={action}>
              <input type="hidden" name="operatorId" value={operatorId} />
              <input type="hidden" name="lotId" value={lot.id} />
              <input type="hidden" name="visible" value="true" />
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
                <Button
                  type="submit"
                  variant="primary"
                  loading={pending}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}
                >
                  <EyeIcon size={16} />
                  <span>Resume Listing (Make Visible in Search)</span>
                </Button>
                <Text variant="body-sm" tone="tertiary">
                  Instantly makes bays bookable to drivers nearby.
                </Text>
              </div>
            </ActionForm>
          ) : (
            <Text variant="body-sm" tone="tertiary">
              Only operator owners and managers can pause or resume listing visibility.
            </Text>
          )}
        </div>
      )}

      {!isToggleable && (
        <div style={{ marginTop: '0.5rem' }}>
          <Text variant="body-sm" tone="secondary">
            {lot.status === 'DRAFT' &&
              'Complete and submit this lot for verification. Once approved by Parkly, it will go live and you will have full control to pause or resume visibility at any time.'}
            {lot.status === 'PENDING_VERIFICATION' &&
              'Parkly is currently verifying your LASPA permit, rates, and site details. Listing visibility controls will be available once the lot is approved.'}
            {lot.status === 'SUSPENDED' &&
              'Listing visibility has been suspended by Parkly. Please review any compliance notes or contact support to resolve before resuming.'}
            {lot.status === 'ARCHIVED' && 'This lot is archived and cannot be toggled.'}
          </Text>
        </div>
      )}

      {state?.error && (
        <p className="pk-notice pk-notice--error" role="alert" style={{ marginTop: '1rem' }}>
          {state.error}
        </p>
      )}
    </section>
  );
}
