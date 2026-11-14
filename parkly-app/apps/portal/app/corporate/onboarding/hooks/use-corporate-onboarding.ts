'use client';

import { useState } from 'react';
import {
  INITIAL_FORM_FIELDS,
  type OnboardingFormFields,
  type OnboardingResult,
  submitCorporateOnboarding,
} from '../data/onboarding-api';

export function useCorporateOnboarding(apiUrl: string) {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successTenant, setSuccessTenant] = useState<OnboardingResult | null>(null);
  const [fields, setFields] = useState<OnboardingFormFields>(INITIAL_FORM_FIELDS);

  const setField = <K extends keyof OnboardingFormFields>(
    key: K,
    value: OnboardingFormFields[K],
  ) => {
    setFields((prev) => ({ ...prev, [key]: value }));
  };

  const handleLegalNameChange = (val: string) => {
    setFields((prev) => {
      const derivedSlug = val
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 30);

      const shouldUpdateSlug =
        !prev.slug ||
        prev.slug ===
          prev.legalName
            .toLowerCase()
            .replace(/[^a-z0-9]/g, '-')
            .slice(0, prev.slug.length);
      const shouldUpdateTitle =
        !prev.portalTitle ||
        prev.portalTitle === `${prev.legalName} Employee Parking & Mobility Portal`;

      return {
        ...prev,
        legalName: val,
        slug: shouldUpdateSlug ? derivedSlug : prev.slug,
        portalTitle: shouldUpdateTitle
          ? `${val} Employee Parking & Mobility Portal`
          : prev.portalTitle,
      };
    });
  };

  const validateStep1 = (): boolean => {
    if (
      !fields.legalName ||
      !fields.cacRcNumber ||
      !fields.slug ||
      !fields.primaryContactName ||
      !fields.primaryContactEmail ||
      !fields.primaryContactPhone
    ) {
      setError('Please complete all required fields in Step 1.');
      return false;
    }
    setError(null);
    return true;
  };

  const validateStep2 = (): boolean => {
    if (!fields.portalTitle) {
      setError('Please provide a portal title.');
      return false;
    }
    setError(null);
    return true;
  };

  const goToStep = (targetStep: 1 | 2 | 3) => {
    if (targetStep === 2 && !validateStep1()) return;
    if (targetStep === 3 && (!validateStep1() || !validateStep2())) return;
    setError(null);
    setStep(targetStep);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateStep1() || !validateStep2()) return;
    if (!fields.emailDomain) {
      setError('Please specify an authorized email domain (e.g. company.com).');
      return;
    }

    setError(null);
    setBusy(true);

    try {
      const result = await submitCorporateOnboarding(apiUrl, fields);
      setSuccessTenant(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred during onboarding');
    } finally {
      setBusy(false);
    }
  };

  return {
    step,
    busy,
    error,
    fields,
    successTenant,
    setField,
    handleLegalNameChange,
    goToStep,
    handleSubmit,
    setError,
  };
}
