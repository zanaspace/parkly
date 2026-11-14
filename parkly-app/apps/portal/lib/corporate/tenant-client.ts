import type { CorporateTenantResponse, ResolveCorporateDomainResponse } from '@parkly/contracts';
import { extractCorporateSubdomain } from './tenant-router';

/**
 * Client for fetching corporate tenant metadata from the Parkly API.
 */
export class CorporateTenantClient {
  constructor(private readonly apiBaseUrl: string) {}

  async getTenantBySlug(slug: string): Promise<CorporateTenantResponse | null> {
    try {
      const res = await fetch(`${this.apiBaseUrl}/v1/corp/${encodeURIComponent(slug)}`, {
        headers: { Accept: 'application/json' },
      });
      if (res.status === 404) return null;
      if (!res.ok) throw new Error(`API returned ${res.status}`);
      return (await res.json()) as CorporateTenantResponse;
    } catch {
      return null;
    }
  }

  async resolveDomain(domain: string): Promise<ResolveCorporateDomainResponse | null> {
    try {
      const res = await fetch(
        `${this.apiBaseUrl}/v1/corp/resolve?domain=${encodeURIComponent(domain)}`,
        {
          headers: { Accept: 'application/json' },
        },
      );
      if (res.status === 404) return null;
      if (!res.ok) throw new Error(`API returned ${res.status}`);
      return (await res.json()) as ResolveCorporateDomainResponse;
    } catch {
      return null;
    }
  }

  async resolveHostname(hostname: string): Promise<CorporateTenantResponse | null> {
    const subdomain = extractCorporateSubdomain(hostname);
    if (!subdomain) return null;
    return this.getTenantBySlug(subdomain);
  }
}
