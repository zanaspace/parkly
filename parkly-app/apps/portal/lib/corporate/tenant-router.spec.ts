import { describe, expect, it } from 'vitest';
import { extractCorporateSubdomain } from './tenant-router';

describe('Corporate Subdomain Router (Sprint CORP-01)', () => {
  it('extracts corporate slug from standard subdomain', () => {
    expect(extractCorporateSubdomain('zenith.parkly.ng')).toBe('zenith');
    expect(extractCorporateSubdomain('kpmg.parkly.ng')).toBe('kpmg');
    expect(extractCorporateSubdomain('dangote.parkly.ng:3000')).toBe('dangote');
  });

  it('handles local development with .localhost', () => {
    expect(extractCorporateSubdomain('zenith.localhost:3000')).toBe('zenith');
    expect(extractCorporateSubdomain('kpmg.localhost')).toBe('kpmg');
  });

  it('ignores reserved system subdomains', () => {
    expect(extractCorporateSubdomain('portal.parkly.ng')).toBeNull();
    expect(extractCorporateSubdomain('admin.parkly.ng')).toBeNull();
    expect(extractCorporateSubdomain('api.parkly.ng')).toBeNull();
    expect(extractCorporateSubdomain('www.parkly.ng')).toBeNull();
    expect(extractCorporateSubdomain('app.parkly.ng')).toBeNull();
  });

  it('returns null for apex domain and raw hosts', () => {
    expect(extractCorporateSubdomain('parkly.ng')).toBeNull();
    expect(extractCorporateSubdomain('localhost')).toBeNull();
    expect(extractCorporateSubdomain('localhost:3000')).toBeNull();
    expect(extractCorporateSubdomain('127.0.0.1:3000')).toBeNull();
  });

  it('supports custom root domain override', () => {
    expect(extractCorporateSubdomain('zenith.custom-domain.com', 'custom-domain.com')).toBe(
      'zenith',
    );
  });
});
