'use client';

import { useEffect, useRef } from 'react';

/** The form field Supabase's captcha token travels in (Turnstile's default name). */
export const CAPTCHA_FIELD = 'cf-turnstile-response';

const SCRIPT_URL = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';

type TurnstileApi = {
  render: (el: HTMLElement, options: Record<string, unknown>) => string;
  reset: (id: string) => void;
  remove: (id: string) => void;
};
declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

let loading: Promise<TurnstileApi> | null = null;
function loadTurnstile(): Promise<TurnstileApi> {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  loading ??= new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${SCRIPT_URL}"]`);
    if (existing) {
      const check = setInterval(() => {
        if (window.turnstile) {
          clearInterval(check);
          resolve(window.turnstile);
        }
      }, 50);
      setTimeout(() => {
        clearInterval(check);
        if (window.turnstile) resolve(window.turnstile);
        else reject(new Error('turnstile load timeout'));
      }, 10000);
      return;
    }
    const script = document.createElement('script');
    script.src = SCRIPT_URL;
    script.async = true;
    script.onload = () =>
      window.turnstile ? resolve(window.turnstile) : reject(new Error('turnstile'));
    script.onerror = () => {
      loading = null;
      reject(new Error('turnstile'));
    };
    document.head.appendChild(script);
  });
  return loading;
}

/**
 * Cloudflare Turnstile inside a form (doc 05 §4.1, ADR 0019). It adds a hidden
 * `cf-turnstile-response` field the server action passes to Supabase as
 * `captchaToken`. Renders nothing without a site key, so captcha stays off
 * until it is configured. Prevents duplicate widget injection on re-renders.
 */
export function Turnstile({ siteKey }: { siteKey: string | undefined }) {
  const box = useRef<HTMLDivElement>(null);
  const widgetId = useRef<string | null>(null);

  useEffect(() => {
    const el = box.current;
    if (!siteKey || !el) return;
    let live = true;

    void loadTurnstile()
      .then((api) => {
        if (!live || !box.current) return;

        // Clean up previous widget in this container before rendering
        if (widgetId.current) {
          try {
            api.remove(widgetId.current);
          } catch {
            // ignore
          }
          widgetId.current = null;
        }
        el.innerHTML = '';

        const id = api.render(el, {
          sitekey: siteKey,
          size: 'flexible',
          theme: 'auto',
          'refresh-expired': 'auto',
        });

        if (!live) {
          try {
            api.remove(id);
          } catch {
            // ignore
          }
          return;
        }
        widgetId.current = id;
      })
      .catch(() => undefined);

    // The submit handler has already read the token by the time this runs.
    const form = el.closest('form');
    const reset = () =>
      setTimeout(() => {
        if (widgetId.current && window.turnstile) {
          try {
            window.turnstile.reset(widgetId.current);
          } catch {
            // ignore
          }
        }
      }, 0);

    form?.addEventListener('submit', reset);
    return () => {
      live = false;
      form?.removeEventListener('submit', reset);
      if (widgetId.current && window.turnstile) {
        try {
          window.turnstile.remove(widgetId.current);
        } catch {
          // ignore
        }
        widgetId.current = null;
      }
      if (el) {
        el.innerHTML = '';
      }
    };
  }, [siteKey]);

  if (!siteKey) return null;
  return (
    <div
      ref={box}
      className="pk-captcha"
      style={{ minHeight: '65px', display: 'flex', flexDirection: 'column' }}
    />
  );
}
