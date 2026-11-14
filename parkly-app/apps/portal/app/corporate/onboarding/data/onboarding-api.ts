import type { SelectOption } from '@parkly/ui';

export type OnboardingFormFields = {
  // Step 1: Organization
  legalName: string;
  cacRcNumber: string;
  slug: string;
  industry: string;
  headOfficeAddress: string;
  primaryContactName: string;
  primaryContactEmail: string;
  primaryContactPhone: string;

  // Administrator Account (when not yet signed in)
  password?: string;
  confirmPassword?: string;

  // Step 2: Brand
  primaryColor: string;
  portalTitle: string;
  welcomeMessage: string;
  logoUrl: string;

  // Step 3: Domain & Cost Center
  emailDomain: string;
  costCenterCode: string;
  costCenterName: string;
  monthlyBudgetKobo: string;
};

export type OnboardingResult = {
  slug: string;
  legalName: string;
};

export const INITIAL_FORM_FIELDS: OnboardingFormFields = {
  legalName: '',
  cacRcNumber: '',
  slug: '',
  industry: 'Banking & Financial Services',
  headOfficeAddress: '',
  primaryContactName: '',
  primaryContactEmail: '',
  primaryContactPhone: '',
  password: '',
  confirmPassword: '',
  primaryColor: '#E31837',
  portalTitle: '',
  welcomeMessage: '',
  logoUrl: '',
  emailDomain: '',
  costCenterCode: 'CC-HQ-01',
  costCenterName: 'Headquarters Staff',
  monthlyBudgetKobo: '250000000', // 2,500,000 NGN in kobo
};

export const INDUSTRY_OPTIONS: readonly SelectOption[] = [
  { value: 'Banking & Financial Services', label: 'Banking & Financial Services' },
  { value: 'Consulting & Advisory', label: 'Consulting & Advisory' },
  { value: 'Energy & Utilities', label: 'Energy & Utilities' },
  { value: 'Logistics & Transport', label: 'Logistics & Supply Chain' },
  { value: 'Technology & SaaS', label: 'Technology & SaaS' },
  { value: 'FMCG & Manufacturing', label: 'FMCG & Manufacturing' },
  { value: 'Healthcare & Pharma', label: 'Healthcare & Pharmaceuticals' },
  { value: 'Other Enterprise', label: 'Other Enterprise' },
];

export const PRESET_COLORS = [
  { name: 'Red', hex: '#E31837' },
  { name: 'Blue', hex: '#00338D' },
  { name: 'Orange', hex: '#F58220' },
  { name: 'Green', hex: '#006A4E' },
  { name: 'Teal', hex: '#008080' },
  { name: 'Purple', hex: '#6366F1' },
];

export async function submitCorporateOnboarding(
  apiUrl: string,
  fields: OnboardingFormFields,
): Promise<OnboardingResult> {
  const payload = {
    legalName: fields.legalName.trim(),
    cacRcNumber: fields.cacRcNumber.trim(),
    slug: fields.slug.trim().toLowerCase(),
    industry: fields.industry.trim(),
    headOfficeAddress: fields.headOfficeAddress.trim() || 'Lagos, Nigeria',
    primaryContactName: fields.primaryContactName.trim(),
    primaryContactEmail: fields.primaryContactEmail.trim().toLowerCase(),
    primaryContactPhone: fields.primaryContactPhone.trim(),
    emailDomain: fields.emailDomain.toLowerCase().replace(/^@/, '').trim(),
    branding: {
      logoUrl: fields.logoUrl.trim() || undefined,
      primaryColor: fields.primaryColor,
      secondaryColor: '#1E1E1E',
      portalTitle: fields.portalTitle.trim() || `${fields.legalName} Corporate Parking Portal`,
      welcomeMessage:
        fields.welcomeMessage.trim() ||
        `Welcome to ${fields.legalName} employee and fleet parking portal.`,
    },
    costCenter: {
      code: fields.costCenterCode.trim(),
      name: fields.costCenterName.trim(),
      monthlyBudgetKobo: fields.monthlyBudgetKobo
        ? parseInt(fields.monthlyBudgetKobo, 10)
        : undefined,
    },
  };

  const res = await fetch(`${apiUrl}/v1/corp/onboard`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  const body = (await res.json()) as {
    code?: string;
    detail?: string;
    slug?: string;
    legalName?: string;
  };

  if (!res.ok) {
    throw new Error(body.detail || body.code || `Registration failed with status ${res.status}`);
  }

  return {
    slug: body.slug || fields.slug.trim().toLowerCase(),
    legalName: body.legalName || fields.legalName.trim(),
  };
}
