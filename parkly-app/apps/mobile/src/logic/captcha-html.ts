/**
 * The Turnstile page shown inside a WebView (ADR 0019). Supabase checks the
 * token when a code is requested, so a script can't spam sign-in codes. The
 * page posts the token (or its expiry) back to the app.
 */

const TURNSTILE =
  'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit&onload=ready';

/** JSON safe to embed in a <script>: `<` can't close the tag. */
const embed = (value: unknown) => JSON.stringify(value).replace(/</g, '\\u003c');

export function captchaHtml(input: { siteKey: string; theme: 'light' | 'dark' }): string {
  return `<!doctype html>
<html><head>
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1">
<style>html, body { margin: 0; background: transparent; } #w { display: flex; justify-content: center; }</style>
<script>
  function send(m) { window.ReactNativeWebView.postMessage(JSON.stringify(m)); }
  function ready() {
    turnstile.render('#w', {
      sitekey: ${embed(input.siteKey)},
      theme: ${embed(input.theme)},
      size: 'flexible',
      callback: function (token) { send({ type: 'token', token: token }); },
      'expired-callback': function () { send({ type: 'expired' }); },
      'error-callback': function () { send({ type: 'error' }); },
    });
  }
</script>
<script src="${TURNSTILE}" async defer></script>
</head><body><div id="w"></div></body></html>`;
}

/** A new token, or null when the last one expired or the check failed. */
export function readCaptchaMessage(data: string): { token: string | null } | null {
  try {
    const m = JSON.parse(data) as { type?: unknown; token?: unknown };
    if (m.type === 'token') return typeof m.token === 'string' ? { token: m.token } : null;
    if (m.type === 'expired' || m.type === 'error') return { token: null };
    return null;
  } catch {
    return null;
  }
}
