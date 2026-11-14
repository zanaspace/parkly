'use client';

import { PreviewTenantCard } from './components/preview-tenant-card';
import { StepBranding } from './components/step-branding';
import { StepCompany } from './components/step-company';
import { StepFleet } from './components/step-fleet';
import { SuccessModal } from './components/success-modal';
import { useCorporateOnboarding } from './hooks/use-corporate-onboarding';

const WIZARD_STEPS = [
  { num: 1, label: 'Company' },
  { num: 2, label: 'Branding' },
  { num: 3, label: 'Domain & Fleet' },
] as const;

export function CorporateOnboardingForm({ apiUrl }: { apiUrl: string }) {
  const {
    step,
    busy,
    error,
    fields,
    successTenant,
    setField,
    handleLegalNameChange,
    goToStep,
    handleSubmit,
  } = useCorporateOnboarding(apiUrl);

  if (successTenant) {
    return <SuccessModal tenant={successTenant} />;
  }

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
        gap: '2rem',
        alignItems: 'start',
      }}
    >
      {/* Left Form Column */}
      <div className="pk-card" style={{ padding: '2rem' }}>
        {/* Step Indicator */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: '1.5rem',
            borderBottom: '1px solid var(--pk-color-border-default)',
            paddingBottom: '1rem',
          }}
        >
          <div style={{ display: 'flex', gap: '0.75rem' }}>
            {WIZARD_STEPS.map((s) => (
              <button
                key={s.num}
                type="button"
                onClick={() => goToStep(s.num)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.35rem',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  color:
                    step === s.num
                      ? 'var(--pk-color-text-brand)'
                      : 'var(--pk-color-text-secondary)',
                  fontWeight: step === s.num ? 700 : 500,
                  fontSize: '0.85rem',
                }}
              >
                <span
                  style={{
                    width: '22px',
                    height: '22px',
                    borderRadius: '50%',
                    backgroundColor:
                      step === s.num
                        ? 'var(--pk-color-text-brand)'
                        : 'var(--pk-color-border-default)',
                    color: step === s.num ? '#ffffff' : 'var(--pk-color-text-secondary)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '0.75rem',
                  }}
                >
                  {s.num}
                </span>
                <span>{s.label}</span>
              </button>
            ))}
          </div>
          <span className="pk-badge pk-badge--live">Step {step} of 3</span>
        </div>

        {error && (
          <div className="pk-notice pk-notice--error" style={{ marginBottom: '1.25rem' }}>
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="pk-form">
          {step === 1 && (
            <StepCompany
              fields={fields}
              setField={setField}
              handleLegalNameChange={handleLegalNameChange}
              onContinue={() => goToStep(2)}
            />
          )}

          {step === 2 && (
            <StepBranding
              fields={fields}
              setField={setField}
              onBack={() => goToStep(1)}
              onContinue={() => goToStep(3)}
            />
          )}

          {step === 3 && (
            <StepFleet fields={fields} busy={busy} setField={setField} onBack={() => goToStep(2)} />
          )}
        </form>
      </div>

      {/* Right Column: Live Interactive Tenant Preview */}
      <PreviewTenantCard fields={fields} />
    </div>
  );
}
