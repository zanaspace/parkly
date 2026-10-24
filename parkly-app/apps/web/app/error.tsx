'use client';

import { Button, Text } from '@parkly/ui';
import Link from 'next/link';

export default function WebError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const isForbidden =
    error.message.includes('FORBIDDEN') ||
    (error.name === 'ApiProblem' && error.message === 'FORBIDDEN');

  return (
    <main className="pk-page pk-stack" style={{ marginBlock: '3rem', maxWidth: '36rem' }}>
      <div className="pk-card pk-stack" style={{ padding: '2rem' }}>
        <Text variant="heading-xl" as="h1">
          {isForbidden ? 'Session Needs Refresh' : 'Something went wrong'}
        </Text>
        <Text tone="secondary">
          {isForbidden
            ? 'Your account session needs to be signed in as a driver to access your bookings.'
            : error.message || 'An unexpected error occurred while loading this page.'}
        </Text>
        <div className="pk-row" style={{ gap: '1rem', marginTop: '1rem', alignItems: 'center' }}>
          {isForbidden ? (
            <Link className="pk-link" href="/sign-in?next=/bookings">
              Sign in as driver
            </Link>
          ) : (
            <Button variant="primary" onClick={() => reset()}>
              Try again
            </Button>
          )}
          <Link className="pk-link" href="/">
            Back to home
          </Link>
        </div>
      </div>
    </main>
  );
}
