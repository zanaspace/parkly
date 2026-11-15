import { describe, expect, it } from 'vitest';
import { getTenantUrl } from './tenant-url';

describe('getTenantUrl', () => {
  it('strips ephemeral preview deployment hashes and returns canonical public portal URL', () => {
    const res = getTenantUrl(
      'sellyticshq',
      'https://parkly-portal-526i0iden-sellytics-1483.vercel.app',
    );
    expect(res.activeUrl).toBe('https://parkly-portal.vercel.app/corp/sellyticshq');
    expect(res.displayUrl).toBe('parkly-portal.vercel.app/corp/sellyticshq');
    expect(res.productionUrl).toBe('https://sellyticshq.parkly.ng');
    expect(res.isStagingOrDev).toBe(true);
  });

  it('handles standard vercel.app staging URL', () => {
    const res = getTenantUrl('zenith', 'https://parkly-portal.vercel.app');
    expect(res.activeUrl).toBe('https://parkly-portal.vercel.app/corp/zenith');
    expect(res.displayUrl).toBe('parkly-portal.vercel.app/corp/zenith');
    expect(res.isStagingOrDev).toBe(true);
  });

  it('handles local development with port', () => {
    const res = getTenantUrl('zenith', 'http://localhost:3001');
    expect(res.activeUrl).toBe('http://localhost:3001/corp/zenith');
    expect(res.displayUrl).toBe('localhost:3001/corp/zenith');
    expect(res.isStagingOrDev).toBe(true);
  });

  it('handles official custom parkly.ng apex domain', () => {
    const res = getTenantUrl('zenith', 'https://portal.parkly.ng');
    expect(res.activeUrl).toBe('https://zenith.parkly.ng');
    expect(res.displayUrl).toBe('zenith.parkly.ng');
    expect(res.productionUrl).toBe('https://zenith.parkly.ng');
    expect(res.isStagingOrDev).toBe(false);
  });

  it('falls back to company slug if empty or blank', () => {
    const res = getTenantUrl('', 'http://localhost:3001');
    expect(res.activeUrl).toBe('http://localhost:3001/corp/company');
  });
});
