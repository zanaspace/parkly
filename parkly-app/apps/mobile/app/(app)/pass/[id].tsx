import type { Pass } from '@parkly/contracts';
import { formatNaira } from '@parkly/domain/money';
import { Button, Text, useTheme } from '@parkly/ui-native';
import * as Crypto from 'expo-crypto';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Linking, View } from 'react-native';
import { useAuth } from '../../../src/auth/AuthProvider';
import { Chip } from '../../../src/components/Chip';
import { Notice } from '../../../src/components/Notice';
import { QrCode } from '../../../src/components/QrCode';
import { Screen } from '../../../src/components/Screen';
import { ApiError } from '../../../src/lib/api';
import { api } from '../../../src/lib/client';
import { GENERIC_ERROR_MESSAGE } from '../../../src/logic/errors';

/** Monthly pass detail: QR ticket, vehicle swap (max 2/mo) & 1-tap renew (FR-PASS-001…004). */
export default function PassDetailScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { vehicles } = useAuth();
  const [pass, setPass] = useState<Pass | null>(null);
  const [swapVehicleId, setSwapVehicleId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState<'verify' | 'swap' | 'renew' | null>(null);

  useEffect(() => {
    let live = true;
    api
      .pass(id)
      .then((found) => {
        if (!live) return;
        setPass(found);
        const other = vehicles?.find((v) => v.id !== found.vehicle.id);
        setSwapVehicleId(other?.id ?? null);
      })
      .catch((err) => {
        if (live) setError(err instanceof ApiError ? err.message : GENERIC_ERROR_MESSAGE);
      });
    return () => {
      live = false;
    };
  }, [id, vehicles]);

  async function verifyPayment() {
    if (!pass) return;
    setBusy('verify');
    setError(null);
    try {
      const updated = await api.verifyPassPayment(pass.id);
      setPass(updated.pass);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : GENERIC_ERROR_MESSAGE);
    } finally {
      setBusy(null);
    }
  }

  async function swapVehicle() {
    if (!pass || !swapVehicleId) return;
    setBusy('swap');
    setError(null);
    setNotice(null);
    try {
      const updated = await api.swapPassVehicle(pass.id, { vehicleId: swapVehicleId });
      setPass(updated);
      setNotice(`Vehicle updated to ${updated.vehicle.plate}.`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : GENERIC_ERROR_MESSAGE);
    } finally {
      setBusy(null);
    }
  }

  async function renewPass() {
    if (!pass) return;
    setBusy('renew');
    setError(null);
    try {
      const res = await api.renewPass(pass.id, {}, Crypto.randomUUID());
      if (res.payment.authorizationUrl) {
        await Linking.openURL(res.payment.authorizationUrl);
      }
      router.replace({ pathname: '/pass/[id]', params: { id: res.pass.id } });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : GENERIC_ERROR_MESSAGE);
    } finally {
      setBusy(null);
    }
  }

  const footer = (
    <Button
      label="Back to passes"
      variant="ghost"
      fullWidth
      onPress={() => router.replace('/passes')}
    />
  );

  if (!pass) {
    return (
      <Screen footer={footer}>
        {error ? (
          <Notice message={error} />
        ) : (
          <ActivityIndicator accessibilityLabel="Loading pass" />
        )}
      </Screen>
    );
  }

  const otherVehicles = (vehicles ?? []).filter((v) => v.id !== pass.vehicle.id);

  return (
    <Screen footer={footer}>
      <Text variant="overline" tone="brand">
        30-DAY MONTHLY PASS · {pass.code}
      </Text>
      <Text variant="heading.xl">{pass.lot.name}</Text>
      <Text tone="secondary">
        {pass.periodStart} – {pass.periodEnd} · {pass.status}
      </Text>
      <Text variant="label.sm" style={{ color: theme.badge.verified.fg }}>
        ✓ Verified Driver · Plate {pass.vehicle.plate}
        {pass.inLot ? ' · Currently parked inside' : ''}
      </Text>

      {notice ? <Notice kind="info" message={notice} /> : null}
      {error ? <Notice message={error} /> : null}

      {pass.status === 'HELD' ? (
        <Button
          label="I’ve paid — verify pass payment"
          fullWidth
          loading={busy === 'verify'}
          onPress={() => void verifyPayment()}
        />
      ) : null}

      {pass.status === 'ACTIVE' && pass.qrToken ? (
        <View
          style={{
            padding: theme.card.padding,
            borderRadius: theme.card.radius,
            borderWidth: 1,
            borderColor: theme.card.border,
            backgroundColor: theme.card.bg,
            alignItems: 'center',
            gap: theme.space.stack.sm,
          }}
        >
          <QrCode value={pass.qrToken} size={220} label={`Pass QR code ${pass.code}`} />
          <Text variant="code.md">{pass.code}</Text>
          <Text variant="body.sm" tone="secondary">
            Show at the gate for unlimited entries during your 30-day window (1 vehicle inside at a
            time).
          </Text>
        </View>
      ) : null}

      {pass.status === 'ACTIVE' ? (
        <View
          style={{
            padding: theme.card.padding,
            borderRadius: theme.card.radius,
            borderWidth: 1,
            borderColor: theme.card.border,
            backgroundColor: theme.card.bg,
            gap: theme.space.stack.sm,
          }}
        >
          <Text variant="heading.sm">
            Swap vehicle ({pass.swapsRemaining} of 2 swaps left this month)
          </Text>
          {otherVehicles.length > 0 && pass.swapsRemaining > 0 && !pass.inLot ? (
            <>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.space.inline.sm }}>
                {otherVehicles.map((v) => (
                  <Chip
                    key={v.id}
                    label={v.plateNorm}
                    selected={v.id === swapVehicleId}
                    onPress={() => setSwapVehicleId(v.id)}
                  />
                ))}
              </View>
              <Button
                label="Swap active vehicle"
                variant="secondary"
                loading={busy === 'swap'}
                disabled={!swapVehicleId}
                onPress={() => void swapVehicle()}
              />
            </>
          ) : (
            <Text variant="body.sm" tone="secondary">
              {pass.inLot
                ? 'Check out of the car park before swapping the active vehicle.'
                : pass.swapsRemaining === 0
                  ? 'You have used both vehicle swaps for this billing month.'
                  : 'Add another vehicle in Account to swap plates on this pass.'}
            </Text>
          )}
        </View>
      ) : null}

      {pass.status === 'ACTIVE' || pass.status === 'EXPIRED' ? (
        <Button
          label={`Renew for 30 days (${formatNaira(pass.totalKobo)})`}
          fullWidth
          loading={busy === 'renew'}
          onPress={() => void renewPass()}
        />
      ) : null}
    </Screen>
  );
}
