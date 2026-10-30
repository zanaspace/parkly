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
 * until it is configured. A token works once, so the widget resets after
 * every submit of its form.
 */
export function Turnstile({ siteKey }: { siteKey: string | undefined }) {
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = box.current;
    if (!siteKey || !el) return;
    let id: string | undefined;
    let live = true;
    void loadTurnstile()
      .then((api) => {
        if (live) id = api.render(el, { sitekey: siteKey, size: 'flexible', theme: 'auto' });
      })
      .catch(() => undefined);
    // The submit handler has already read the token by the time this runs.
    const form = el.closest('form');
    const reset = () => setTimeout(() => id && window.turnstile?.reset(id), 0);
    form?.addEventListener('submit', reset);
    return () => {
      live = false;
      form?.removeEventListener('submit', reset);
      if (id) window.turnstile?.remove(id);
    };
  }, [siteKey]);
  if (!siteKey) return null;
  return <div ref={box} className="pk-captcha" />;
}
