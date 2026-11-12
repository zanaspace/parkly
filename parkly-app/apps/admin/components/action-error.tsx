'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { STEP_UP_MESSAGE } from '../lib/auth/step-up';

/** An action's error. When it is the step-up prompt, it links to the check and back to this page. */
export function ActionError({ message }: { message: string }) {
  const pathname = usePathname();
  return (
    <p className="pk-notice pk-notice--error" role="alert">
      {message}
      {message === STEP_UP_MESSAGE ? (
        <>
          {' '}
          <Link className="pk-link" href={`/mfa/confirm?next=${encodeURIComponent(pathname)}`}>
            Confirm now
          </Link>
        </>
      ) : null}
    </p>
  );
}
