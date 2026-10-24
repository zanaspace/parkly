'use client';

import { Button, Text } from '@parkly/ui';
import { AlertTriangleIcon } from '../../components/icons';

export default function ProtectedError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const isApiConnectionError =
    error.message.includes('Failed to reach the Parkly API') ||
    error.message.includes('fetch failed') ||
    error.message.includes('ECONNREFUSED');

  return (
    <main className="pk-page" style={{ marginBlock: '3rem' }}>
      <div
        className="pk-card"
        style={{
          padding: '2.5rem',
          borderRadius: 'var(--pk-radius-lg)',
          border: '1px solid var(--pk-color-border-subtle)',
          backgroundColor: 'var(--pk-color-bg-surface)',
          display: 'flex',
          flexDirection: 'column',
          gap: '1.25rem',
          maxWidth: '36rem',
          marginInline: 'auto',
          width: '100%',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <div
            style={{
              width: '40px',
              height: '40px',
              borderRadius: '50%',
              backgroundColor: 'var(--pk-color-status-danger-bg)',
              color: 'var(--pk-color-status-danger-fg)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <AlertTriangleIcon size={22} />
          </div>
          <div>
            <Text variant="heading-md">
              {isApiConnectionError ? 'API Connection Required' : 'An error occurred'}
            </Text>
          </div>
        </div>

        <Text variant="body-md" tone="secondary">
          {isApiConnectionError
            ? 'The Operator Portal cannot reach the Parkly backend API service on port 4000. Ensure the API server is running with `pnpm --filter @parkly/api dev`.'
            : error.message || 'An unexpected error occurred while loading this section.'}
        </Text>

        <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.5rem' }}>
          <Button variant="primary" onClick={() => reset()}>
            Retry
          </Button>
          <Button variant="secondary" onClick={() => window.location.reload()}>
            Reload Page
          </Button>
        </div>
      </div>
    </main>
  );
}
