import { describe, expect, it } from 'vitest';
import { legalUrl } from './legal-links';

describe('legal links', () => {
  it('points at the website pages', () => {
    expect(legalUrl('terms', 'https://parkly.example')).toBe('https://parkly.example/legal/terms');
    expect(legalUrl('privacy', 'https://parkly.example/')).toBe(
      'https://parkly.example/legal/privacy',
    );
  });

  it('falls back to the dev site when no address is set', () => {
    expect(legalUrl('terms', undefined)).toBe('https://parkly-web-two.vercel.app/legal/terms');
    expect(legalUrl('privacy', '  ')).toBe('https://parkly-web-two.vercel.app/legal/privacy');
  });
});
