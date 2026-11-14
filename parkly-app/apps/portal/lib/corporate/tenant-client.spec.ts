import { describe, expect, it, vi } from 'vitest';
import { CorporateTenantClient } from './tenant-client';

describe('CorporateTenantClient (Sprint CORP-01)', () => {
  it('fetches tenant metadata by slug successfully', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        id: 'corp-123',
        slug: 'zenith',
        legalName: 'Zenith Bank PLC',
        industry: 'BANKING',
        billingTier: 'ENTERPRISE',
        branding: {
          logoUrl: 'https://cdn.parkly.ng/zenith.png',
          primaryColor: '#E31837',
          secondaryColor: '#1E1E1E',
          portalTitle: 'Zenith Bank Parking',
          welcomeMessage: 'Welcome to Zenith Bank Parking Portal',
        },
        emailDomains: ['zenithbank.com'],
      }),
    });

    vi.stubGlobal('fetch', mockFetch);

    const client = new CorporateTenantClient('https://api.parkly.ng');
    const tenant = await client.getTenantBySlug('zenith');

    expect(tenant).not.toBeNull();
    expect(tenant?.slug).toBe('zenith');
    expect(tenant?.legalName).toBe('Zenith Bank PLC');
    expect(tenant?.branding?.primaryColor).toBe('#E31837');
    expect(mockFetch).toHaveBeenCalledWith('https://api.parkly.ng/v1/corp/zenith', {
      headers: { Accept: 'application/json' },
    });

    vi.unstubAllGlobals();
  });

  it('returns null on 404', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
      }),
    );

    const client = new CorporateTenantClient('https://api.parkly.ng');
    const tenant = await client.getTenantBySlug('non-existent');
    expect(tenant).toBeNull();

    vi.unstubAllGlobals();
  });

  it('resolves corporate hostname from incoming request', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          id: 'corp-456',
          slug: 'kpmg',
          legalName: 'KPMG Nigeria',
          industry: 'CONSULTING',
          billingTier: 'STANDARD',
          branding: null,
          emailDomains: ['kpmg.ng'],
        }),
      }),
    );

    const client = new CorporateTenantClient('https://api.parkly.ng');
    const tenant = await client.resolveHostname('kpmg.parkly.ng');
    expect(tenant?.slug).toBe('kpmg');

    const invalid = await client.resolveHostname('portal.parkly.ng');
    expect(invalid).toBeNull();

    vi.unstubAllGlobals();
  });
});
