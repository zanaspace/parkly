'use client';

import { useEffect } from 'react';

/** Registers the attendant app's service worker so /attend opens with no network. */
export function ServiceWorker() {
  useEffect(() => {
    if ('serviceWorker' in navigator)
      void navigator.serviceWorker
        .register('/attend-sw.js', { scope: '/attend' })
        .catch(() => undefined);
  }, []);
  return null;
}
