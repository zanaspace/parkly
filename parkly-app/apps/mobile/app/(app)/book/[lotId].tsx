import type { PublicLot, Quote, UnpaidOverstay } from '@parkly/contracts';
import { lineLabel, searchWindow, windowLabel } from '@parkly/domain/discovery';
import { formatNaira } from '@parkly/domain/money';
import { Button, Text, useTheme } from '@parkly/ui-native';
import * as Crypto from 'expo-crypto';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { useAuth } from '../../../src/auth/AuthProvider';
import { Chip } from '../../../src/components/Chip';
import { Notice } from '../../../src/components/Notice';
import { Screen } from '../../../src/components/Screen';
import { ApiError } from '../../../src/lib/api';
import { api } from '../../../src/lib/client';
import { GENERIC_ERROR_MESSAGE } from '../../../src/logic/errors';
import { fromParams } from '../../../src/logic/search';

/** D-14 + D-15 Select vehicle and review (doc 03 §1.4): pick the car, see the server’s total, pay. */
export default function ReviewAndPay() {
  const theme = useTheme();
  const router = useRouter();
  const params = useLocalSearchParams<{ lotId: string }>();
  const [search] = useState(() => fromParams(params, new Date()));
  const lotId = params.lotId;
  const { vehicles } = useAuth();
  const [vehicleId, setVehicleId] = useState<string | null>(
    () => vehicles?.find((v) => v.isDefault)?.id ?? vehicles?.[0]?.id ?? null,
  );
  const [lot, setLot] = useState<PublicLot | null>(null);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [unpaid, setUnpaid] = useState<UnpaidOverstay['unpaid']>(null);
  const [paying, setPaying] = useState(false);
  // One key per car: a second tap (or a retry after a dropped connection)
  // returns the same booking instead of holding a second space.
  const keys = useRef(new Map<string, string>());

  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const found = await api.lot(lotId);
        const [q, owed] = await Promise.all([
          api.quote(found.id, searchWindow(search)),
          api.unpaidOverstay(),
        ]);
        if (live) {
          setLot(found);
          setQuote(q);
          setUnpaid(owed.unpaid);
        }
      } catch (err) {
        if (live) setError(err instanceof ApiError ? err.message : GENERIC_ERROR_MESSAGE);
      }
    })();
    return () => {
      live = false;
    };
  }, [lotId, search]);

  async function pay() {
    if (!lot || !vehicleId) return;
    setError(null);
    setPaying(true);
    const key = keys.current.get(vehicleId) ?? Crypto.randomUUID();
    keys.current.set(vehicleId, key);
    try {
      const w = searchWindow(search);
      const created = await api.createBooking(
        { lotId: lot.id, vehicleId, product: w.product, startAt: w.startAt, endAt: w.endAt },
        key,
      );
      if (!created.payment.authorizationUrl) throw new Error('no checkout link');
      router.replace({
        pathname: '/pay/[reference]',
        params: {
          reference: created.payment.reference,
          url: created.payment.authorizationUrl,
          bookingId: created.booking.id,
        },
      });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : GENERIC_ERROR_MESSAGE);
    } finally {
      setPaying(false);
    }
  }

  if (!lot || !quote)
    return (
      <Screen
        footer={
          <Button
            label="Back"
            variant="ghost"
            fullWidth
            onPress={() => (router.canGoBack() ? router.back() : router.replace('/home'))}
          />
        }
      >
        {error ? (
          <Notice message={error} />
        ) : (
          <ActivityIndicator accessibilityLabel="Getting the price" />
        )}
      </Screen>
    );

  // FR-BOOK-008: an overstay unpaid for 24 hours must be paid before booking again.
  if (unpaid)
    return (
      <Screen
        footer={
          <>
            <Button
              label={`Pay ${formatNaira(unpaid.amountKobo)}`}
              fullWidth
              onPress={() =>
                router.push({ pathname: '/booking/[id]', params: { id: unpaid.bookingId } })
              }
            />
            <Button
              label="Back"
              variant="ghost"
              fullWidth
              onPress={() => (router.canGoBack() ? router.back() : router.replace('/home'))}
            />
          </>
        }
      >
        <Text variant="heading.xl">Pay your overstay first</Text>
        <Notice
          message={`You have an unpaid overstay of ${formatNaira(unpaid.amountKobo)} at ${unpaid.lotName} (booking ${unpaid.bookingCode}). Pay it to book again.`}
        />
      </Screen>
    );

  return (
    <Screen
      footer={
        <>
          <Button
            label={paying ? 'Opening payment…' : `Pay ${formatNaira(quote.totalKobo)}`}
            fullWidth
            disabled={paying || !vehicleId}
            onPress={() => void pay()}
          />
          <Button
            label="Back"
            variant="ghost"
            fullWidth
            onPress={() => (router.canGoBack() ? router.back() : router.replace('/home'))}
          />
        </>
      }
    >
      <Text variant="overline" tone="brand">
        Review and pay
      </Text>
      <Text variant="heading.xl">{lot.name}</Text>
      <Text tone="secondary">{lot.addressLine}</Text>
      <Text variant="label.lg">{windowLabel(search)}</Text>

      <View style={{ gap: theme.space.stack.sm }}>
        <Text variant="label.lg">Car</Text>
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
        ) : (
          <>
            <Notice
              kind="warning"
              message="Add your car first. Attendants check the plate at the gate."
            />
            <Button
              label="Add a car"
              variant="secondary"
              onPress={() => router.push('/add-vehicle')}
            />
          </>
        )}
      </View>

      <View style={{ gap: theme.space.stack.xs }}>
        {quote.lines.map((l, i) => (
          <View key={i} style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Text variant="body.sm" style={{ flex: 1 }}>
              {lineLabel(l)}
            </Text>
            <Text variant="body.sm">{formatNaira(l.amountKobo)}</Text>
          </View>
        ))}
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <Text variant="label.lg">Total</Text>
          <Text variant="label.lg">{formatNaira(quote.totalKobo)}</Text>
        </View>
      </View>

      <Text variant="body.sm" tone="secondary">
        We hold your space for 10 minutes while you pay with card, bank transfer or USSD on
        Paystack. Free cancellation until 30 minutes before your start time.
      </Text>
      {error ? <Notice message={error} /> : null}
    </Screen>
  );
}
