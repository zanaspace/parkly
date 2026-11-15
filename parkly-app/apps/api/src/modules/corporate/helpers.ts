import { z } from '@hono/zod-openapi';
import type {
  CorporateAccountRow,
  CorporateBrandingRow,
  CorporateFleetDriverRow,
} from '../../store/types.js';

export const json = <T>(schema: T) => ({ content: { 'application/json': { schema } } });
export const SlugParam = z.object({ slug: z.string().min(1).max(64) });
export const DriverParam = z.object({ slug: z.string().min(1).max(64), driverId: z.string().uuid() });
export const DomainQuery = z.object({ domain: z.string().min(1) });

export function serializeDriver(d: CorporateFleetDriverRow) {
  return {
    ...d,
    createdAt: d.createdAt instanceof Date ? d.createdAt.toISOString() : String(d.createdAt),
    updatedAt: d.updatedAt instanceof Date ? d.updatedAt.toISOString() : String(d.updatedAt),
  };
}

export function formatTenant(
  account: CorporateAccountRow,
  branding: CorporateBrandingRow | null,
  emailDomains: string[],
) {
  return {
    id: account.id,
    slug: account.slug,
    legalName: account.legalName,
    cacRcNumber: account.cacRcNumber,
    industry: account.industry,
    headOfficeAddress: account.headOfficeAddress,
    primaryContactName: account.primaryContactName,
    primaryContactEmail: account.primaryContactEmail,
    primaryContactPhone: account.primaryContactPhone,
    billingTier: account.billingTier,
    branding: branding
      ? {
          logoUrl: branding.logoUrl,
          primaryColor: branding.primaryColor,
          secondaryColor: branding.secondaryColor,
          portalTitle: branding.portalTitle,
          welcomeMessage: branding.welcomeMessage,
        }
      : null,
    emailDomains,
  };
}
