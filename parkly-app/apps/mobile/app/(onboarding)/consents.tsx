import { Button, Text } from '@parkly/ui-native';
import { useState } from 'react';
import { useAuth } from '../../src/auth/AuthProvider';
import { Checkbox } from '../../src/components/Checkbox';
import { Notice } from '../../src/components/Notice';
import { Screen } from '../../src/components/Screen';
import { ApiError } from '../../src/lib/api';
import { api } from '../../src/lib/client';

/**
 * D-06 Consents (FR-AUTH-002): Terms and Privacy are required; marketing is
 * optional and unticked by default. Each decision is stored with its version.
 */
export default function Consents() {
  const auth = useAuth();
  const versions = auth.me?.currentLegalVersions;
  const [terms, setTerms] = useState(false);
  const [privacy, setPrivacy] = useState(false);
  const [marketing, setMarketing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!versions) return;
    if (!terms || !privacy) {
      setError(
        'You need to accept the Terms and the Privacy Notice to use Parkly, because we can’t take bookings or payments without them.',
      );
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api.recordConsent({ type: 'TERMS', version: versions.terms, granted: true });
      await api.recordConsent({ type: 'PRIVACY', version: versions.privacy, granted: true });
      // Recorded either way, so the opt-in history is complete; the latest response has profileComplete.
      auth.setMe(
        await api.recordConsent({
          type: 'MARKETING',
          version: versions.privacy,
          granted: marketing,
        }),
      );
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : 'Could not save your choices. Please try again.',
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen
      footer={
        <Button
          label="Agree and continue"
          size="lg"
          fullWidth
          loading={busy}
          onPress={() => void submit()}
        />
      }
    >
      <Text variant="heading.lg">Before you start</Text>
      <Text tone="secondary">
        Please read and accept how Parkly works and how we handle your data.
      </Text>
      <Checkbox
        checked={terms}
        onChange={setTerms}
        label="I accept the Driver Terms"
        description={versions ? `Version ${versions.terms}` : undefined}
      />
      <Checkbox
        checked={privacy}
        onChange={setPrivacy}
        label="I have read the Privacy Notice"
        description={versions ? `Version ${versions.privacy}` : undefined}
      />
      <Checkbox
        checked={marketing}
        onChange={setMarketing}
        label="Send me offers by SMS or WhatsApp (optional)"
        description="You can change this any time in Account."
      />
      {error ? <Notice message={error} /> : null}
    </Screen>
  );
}
