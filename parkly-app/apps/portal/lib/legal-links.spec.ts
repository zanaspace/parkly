import { describe, expect, it } from 'vitest';
import { legalUrl } from './legal-links';

describe('operator legal links', () => {
  it('point at the website pages, and at a section when asked', () => {
    expect(legalUrl('operators', 'https://parkly.example')).toBe(
      'https://parkly.example/legal/operators',
    );
    expect(legalUrl('operators', 'https://parkly.example/', 'data')).toBe(
      'https://parkly.example/legal/operators#data',
    );
  });

  it('fall back to the dev site when no address is set', () => {
    expect(legalUrl('operators', undefined)).toBe(
      'https://parkly-web-two.vercel.app/legal/operators',
    );
    expect(legalUrl('privacy', ' ')).toBe('https://parkly-web-two.vercel.app/legal/privacy');
  });
});
