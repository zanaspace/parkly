import type { Pass, PublicLot } from '@parkly/contracts';
import { formatNaira } from '@parkly/domain/money';
import { lagosDateKey } from '@parkly/domain/time';
import { Button, Text, useTheme } from '@parkly/ui-native';
import * as Crypto from 'expo-crypto';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, View } from 'react-native';
import { useAuth } from '../../src/auth/AuthProvider';
import { Chip } from '../../src/components/Chip';
import { Notice } from '../../src/components/Notice';
import { Screen } from '../../src/components/Screen';
import { ApiError } from '../../src/lib/api';
import { api } from '../../src/lib/client';
import { GENERIC_ERROR_MESSAGE } from '../../src/logic/errors';

/** Monthly passes list & purchase (FR-PASS-001…005). */
export default function PassesScreen() {
  const theme = useTheme();
  const router = useRouter();
  const params = useLocalSearchParams<{ lotId?: string; slug?: string }>();
  const { me, vehicles } = useAuth();
  const [passes, setPasses] = useState<Pass[] | null>(null);
  const [lot, setLot] = useState<PublicLot | null>(null);
  const [vehicleId, setVehicleId] = useState<string | null>(
    () => vehicles?.find((v) => v.isDefault)?.id ?? vehicles?.[0]?.id ?? null,
  );
  const [error, setError] = useState<string | null>(null);
  const [capReached, setCapReached] = useState(false);
  const [waitlistJoined, setWaitlistJoined] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let live = true;
    const target = params.slug ?? params.lotId;
    (async () => {
      try {
        const [items, foundLot] = await Promise.all([
          api.passes(),
          target ? api.lot(target).catch(() => null) : Promise.resolve(null),
        ]);
        if (!live) return;
        setPasses(items);
        setLot(foundLot);
      } catch (err) {
        if (live) setError(err instanceof ApiError ? err.message : GENERIC_ERROR_MESSAGE);
      }
    })();
    return () => {
      live = false;
    };
  }, [params.lotId, params.slug]);

  const monthlyPrice = lot?.prices.find((p) => p.product === 'MONTHLY');

  async function buyPass() {
    if (!lot || !vehicleId) return;
    setBusy(true);
    setError(null);
    setCapReached(false);
    try {
      const startDate = lagosDateKey(new Date());
      const res = await api.createPass(
        { lotId: lot.id, vehicleId, startDate, source: 'MOBILE' },
        Crypto.randomUUID(),
      );
      if (res.payment.authorizationUrl) {
        await Linking.openURL(res.payment.authorizationUrl);
      }
      router.push({ pathname: '/pass/[id]', params: { id: res.pass.id } });
    } catch (err) {
      if (err instanceof ApiError && err.code === 'PASS_CAPACITY_UNAVAILABLE') {
        setCapReached(true);
      }
      setError(err instanceof ApiError ? err.message : GENERIC_ERROR_MESSAGE);
    } finally {
      setBusy(false);
    }
  }

  async function joinWaitlist() {
    if (!lot) return;
    setBusy(true);
    setError(null);
    try {
      await api.joinPassWaitlist({ lotId: lot.id, desiredStartDate: lagosDateKey(new Date()) });
      setWaitlistJoined(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : GENERIC_ERROR_MESSAGE);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen showNav>
      <Text variant="heading.xl">Monthly passes</Text>
      <Text tone="secondary">
        30-day passes for regular parking at a single verified car park. One vehicle inside at a
        time; swap vehicles up to twice a month.
      </Text>

      {!me?.isVerifiedDriver ? (
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
          <Text variant="label.lg">Verified Driver required</Text>
          <Text variant="body.sm" tone="secondary">
            Complete a 60-second identity check (FRSC Driver’s License or NIN) in Account to unlock
            monthly passes.
          </Text>
          <Button
            label="Verify in Account"
            variant="secondary"
            onPress={() => router.push('/account')}
          />
        </View>
      ) : (
        <Text variant="label.sm" style={{ color: theme.badge.verified.fg }}>
          ✓ Verified Driver
        </Text>
      )}

      {lot && monthlyPrice ? (
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
          <Text variant="heading.sm">Buy 30-day pass · {lot.name}</Text>
          <Text variant="body.sm" tone="secondary">
            {formatNaira(monthlyPrice.monthlyRateKobo ?? 0)} / 30 days (+ 10% service fee)
          </Text>
          {vehicles && vehicles.length > 0 ? (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.space.inline.sm }}>
              {vehicles.map((v) => (
                <Chip
                  key={v.id}
                  label={v.plateNorm}
                  selected={v.id === vehicleId}
                  onPress={() => setVehicleId(v.id)}
                />
              ))}
            </View>
          ) : null}
          <Button
            label="Buy 30-day pass"
            fullWidth
            loading={busy}
            disabled={!me?.isVerifiedDriver || !vehicleId}
            onPress={() => void buyPass()}
          />
          {capReached && !waitlistJoined ? (
            <Button
              label="Join monthly pass waitlist"
              variant="secondary"
              fullWidth
              loading={busy}
              onPress={() => void joinWaitlist()}
            />
          ) : null}
          {waitlistJoined ? (
            <Notice
              kind="info"
              message="You are on the waitlist. We’ll notify you when a monthly pass slot opens."
            />
          ) : null}
        </View>
      ) : null}

      {error ? <Notice message={error} /> : null}
      {!passes && !error ? <ActivityIndicator accessibilityLabel="Loading passes" /> : null}
      {passes && passes.length === 0 ? (
        <Text tone="secondary">No monthly passes yet. Open a car park to buy a 30-day pass.</Text>
      ) : null}

      {passes?.map((p) => (
        <Pressable
          key={p.id}
          accessibilityRole="button"
          accessibilityLabel={`${p.lot.name}, monthly pass ${p.code}, ${p.status}`}
          onPress={() => router.push({ pathname: '/pass/[id]', params: { id: p.id } })}
          style={{
            gap: theme.space.stack.xs,
            padding: theme.card.padding,
            borderRadius: theme.card.radius,
            borderWidth: 1,
            borderColor: theme.card.border,
            backgroundColor: theme.card.bg,
          }}
        >
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Text variant="label.lg" style={{ flex: 1 }}>
              {p.lot.name}
            </Text>
            <Text variant="code.md">{p.code}</Text>
          </View>
          <Text variant="body.sm">
            {p.periodStart} – {p.periodEnd}
          </Text>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Text variant="body.sm" tone="secondary">
              {p.status} · {p.vehicle.plate}
              {p.inLot ? ' · Inside lot' : ''}
            </Text>
            <Text variant="body.sm">{formatNaira(p.totalKobo)}</Text>
          </View>
        </Pressable>
      ))}
    </Screen>
  );
}
