import { describe, expect, it } from 'vitest';
import { captchaHtml, readCaptchaMessage } from './captcha-html';

describe('captcha page for the WebView', () => {
  it('loads Turnstile from Cloudflare with the site key', () => {
    const html = captchaHtml({ siteKey: 'site-key', theme: 'dark' });
    expect(html).toContain('https://challenges.cloudflare.com/turnstile/v0/api.js');
    expect(html).toContain('"site-key"');
    expect(html).toContain('"dark"');
  });

  it('embeds the site key so it can never close the script tag', () => {
    const html = captchaHtml({ siteKey: '</script><script>alert(1)</script>', theme: 'light' });
    expect(html).not.toContain('</script><script>alert(1)');
    expect(html).toContain('\\u003c/script>');
  });

  it('reads a token, an expiry or an error, and ignores anything else', () => {
    expect(readCaptchaMessage('{"type":"token","token":"abc"}')).toEqual({ token: 'abc' });
    expect(readCaptchaMessage('{"type":"expired"}')).toEqual({ token: null });
    expect(readCaptchaMessage('{"type":"error"}')).toEqual({ token: null });
    expect(readCaptchaMessage('{"type":"token","token":5}')).toBeNull();
    expect(readCaptchaMessage('{"type":"open","id":"x"}')).toBeNull();
    expect(readCaptchaMessage('not json')).toBeNull();
  });
});
