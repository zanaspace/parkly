import { Ionicons } from '@expo/vector-icons';
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
import { DurationPicker } from '../../../src/components/DurationPicker';
import { Notice } from '../../../src/components/Notice';
import { Screen } from '../../../src/components/Screen';
import { useProfileMode } from '../../../src/context/ProfileModeContext';
import { ApiError } from '../../../src/lib/api';
import { api } from '../../../src/lib/client';
import { GENERIC_ERROR_MESSAGE } from '../../../src/logic/errors';
import { fromParams } from '../../../src/logic/search';

/** D-14 + D-15 Select vehicle and review (doc 03 §1.4): pick the car, see the server’s total, pay. */
export default function ReviewAndPay() {
  const theme = useTheme();
  const router = useRouter();
  const params = useLocalSearchParams<{ lotId: string }>();
  const [search, setSearch] = useState(() => fromParams(params, new Date()));
  const lotId = params.lotId;
  const { vehicles } = useAuth();
  const { isCorporate, corporateCompany } = useProfileMode();
  const [vehicleId, setVehicleId] = useState<string | null>(
    () => vehicles?.find((v) => v.isDefault)?.id ?? vehicles?.[0]?.id ?? null,
  );
  const [lot, setLot] = useState<PublicLot | null>(null);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [bookingType, setBookingType] = useState<'RESERVE' | 'PARK_NOW'>('RESERVE');
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
        const hasDaily = found.prices.some((p) => p.product === 'DAILY');
        const [q, owed] = await Promise.all([
          api.quote(
            found.id,
            searchWindow(search, { preferProduct: hasDaily ? undefined : 'HOURLY' }),
          ),
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
      const hasDaily = lot.prices.some((p) => p.product === 'DAILY');
      const w = searchWindow(search, { preferProduct: hasDaily ? undefined : 'HOURLY' });
      const created = await api.createBooking(
        {
          lotId: lot.id,
          vehicleId,
          product: w.product,
          bookingType,
          startAt: w.startAt,
          endAt: w.endAt,
          corporate: isCorporate,
          corporateCompany: corporateCompany ?? undefined,
        },
        key,
      );
      if (isCorporate) {
        router.replace({
          pathname: '/booking/[id]',
          params: { id: created.booking.id },
        });
        return;
      }
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
            label={
              paying
                ? isCorporate
                  ? 'Confirming corporate booking…'
                  : 'Opening payment…'
                : isCorporate
                  ? 'Confirm Corporate Booking (₦0 due)'
                  : `Pay ${formatNaira(quote.totalKobo)}`
            }
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
        {isCorporate ? 'Review & Confirm Corporate Booking' : 'Review and pay'}
      </Text>
      <Text variant="heading.xl">{lot.name}</Text>
      <Text tone="secondary">{lot.addressLine}</Text>
      <Text variant="label.lg">{windowLabel(search)}</Text>

      {isCorporate ? (
        <View
          style={{
            backgroundColor: theme.color.bg['brand-subtle'],
            borderColor: theme.color.border.brand,
            borderWidth: 1,
            borderRadius: 14,
            padding: 12,
            gap: 4,
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Ionicons name="briefcase-outline" size={16} color={theme.color.text.brand} />
            <Text variant="label.sm" tone="brand" style={{ fontWeight: '700' }}>
              Corporate Fleet Billing Active
            </Text>
          </View>
          <Text variant="body.sm" tone="secondary">
            Invoiced to {corporateCompany ?? 'Corporate Fleet'}. 100% employer-covered with ₦0
            out-of-pocket for you.
          </Text>
        </View>
      ) : null}

      <DurationPicker
        duration={search.duration}
        onChange={(d) => setSearch((prev) => ({ ...prev, duration: d }))}
      />

      <View style={{ gap: theme.space.stack.sm }}>
        <Text variant="label.lg">Booking option</Text>
        <View style={{ flexDirection: 'row', gap: theme.space.inline.sm }}>
          <Chip
            label="Reserve for later"
            selected={bookingType === 'RESERVE'}
            onPress={() => setBookingType('RESERVE')}
          />
          <Chip
            label="Park now"
            selected={bookingType === 'PARK_NOW'}
            onPress={() => setBookingType('PARK_NOW')}
          />
        </View>
        {bookingType === 'PARK_NOW' ? (
          <Notice
            kind="info"
            message="Space held immediately with 60 min free courtesy. Your stay timer starts when you check in."
          />
        ) : null}
      </View>

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
        {isCorporate ? (
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Text variant="body.sm" tone="brand" style={{ flex: 1, fontWeight: '600' }}>
              Corporate fleet subsidy ({corporateCompany ?? 'Corporate Fleet'})
            </Text>
            <Text variant="body.sm" tone="brand" style={{ fontWeight: '600' }}>
              -{formatNaira(quote.totalKobo)}
            </Text>
          </View>
        ) : null}
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingTop: 4 }}>
          <Text variant="label.lg">{isCorporate ? 'Amount due from driver' : 'Total'}</Text>
          <Text
            variant="label.lg"
            style={{ color: isCorporate ? theme.color.text.brand : undefined }}
          >
            {isCorporate ? '₦0' : formatNaira(quote.totalKobo)}
          </Text>
        </View>
      </View>

      <Text variant="body.sm" tone="secondary">
        {isCorporate
          ? `This stay is billed directly to ${corporateCompany ?? 'your employer'}'s corporate invoicing account. No card or personal payment required.`
          : 'We hold your space for 10 minutes while you pay with card, bank transfer or USSD on Paystack. Free cancellation until 30 minutes before your start time.'}
      </Text>
      {error ? <Notice message={error} /> : null}
    </Screen>
  );
}
