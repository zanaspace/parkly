import type { Booking } from '@parkly/contracts';
import { lineLabel } from '@parkly/domain/discovery';
import { formatNaira } from '@parkly/domain/money';
import { Button, Text, useTheme } from '@parkly/ui-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { Notice } from '../../../src/components/Notice';
import { Screen } from '../../../src/components/Screen';
import { ApiError } from '../../../src/lib/api';
import { api } from '../../../src/lib/client';
import { bookingWindowLabel, statusLabel } from '@parkly/domain/booking';
import { GENERIC_ERROR_MESSAGE } from '../../../src/logic/errors';

const POLL_MS = 3_000;

/** D-17 Booking confirmed (doc 03 §1.4; QR arrives with check-in, S5): the code the attendant asks for, where and when, what was paid. */
export default function BookingScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [booking, setBooking] = useState<Booking | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const load = async () => {
      try {
        const b = await api.booking(id);
        if (!live) return;
        setBooking(b);
        // A webhook may still be confirming it; keep looking while it waits.
        if (b.status === 'PENDING_PAYMENT') timer = setTimeout(() => void load(), POLL_MS);
      } catch (err) {
        if (live) setError(err instanceof ApiError ? err.message : GENERIC_ERROR_MESSAGE);
      }
    };
    void load();
    return () => {
      live = false;
      if (timer) clearTimeout(timer);
    };
  }, [id]);

  const footer = (
    <>
      <Button label="My bookings" fullWidth onPress={() => router.replace('/bookings')} />
      <Button label="Home" variant="ghost" fullWidth onPress={() => router.replace('/home')} />
    </>
  );

  if (!booking)
    return (
      <Screen footer={footer}>
        {error ? (
          <Notice message={error} />
        ) : (
          <ActivityIndicator accessibilityLabel="Loading booking" />
        )}
      </Screen>
    );

  const confirmed = booking.status === 'CONFIRMED' || booking.status === 'CHECKED_IN';
  const card = {
    gap: theme.space.stack.xs,
    padding: theme.card.padding,
    borderRadius: theme.card.radius,
    borderWidth: 1,
    borderColor: theme.card.border,
    backgroundColor: theme.card.bg,
  };

  return (
    <Screen footer={footer}>
      <Text variant="overline" tone="brand">
        {statusLabel(booking.status)}
      </Text>
      <Text variant="heading.xl">
        {confirmed
          ? 'You’re booked'
          : booking.status === 'PENDING_PAYMENT'
            ? 'Almost there'
            : 'Booking'}
      </Text>

      {confirmed ? (
        <View style={[card, { alignItems: 'center' }]}>
          <Text tone="secondary">Show this code at the gate</Text>
          <Text
            variant="heading.xl"
            accessibilityLabel={`Booking code ${booking.code.split('').join(' ')}`}
          >
            {booking.code}
          </Text>
          <Text variant="code.md">{booking.vehicle.plate}</Text>
        </View>
      ) : null}
      {booking.status === 'PENDING_PAYMENT' ? (
        <Notice
          kind="info"
          message="We’re waiting for Paystack to confirm your payment. This page updates by itself."
        />
      ) : null}
      {error ? <Notice message={error} /> : null}

      <View style={card}>
        <Text variant="label.lg">{booking.lot.name}</Text>
        <Text tone="secondary">{booking.lot.addressLine}</Text>
        <Text>{bookingWindowLabel(booking)}</Text>
      </View>

      <View style={card}>
        {booking.lines.map((l, i) => (
          <View key={i} style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Text variant="body.sm" style={{ flex: 1 }}>
              {lineLabel(l)}
            </Text>
            <Text variant="body.sm">{formatNaira(l.amountKobo)}</Text>
          </View>
        ))}
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <Text variant="label.lg">{confirmed ? 'Paid' : 'Total'}</Text>
          <Text variant="label.lg">{formatNaira(booking.totalKobo)}</Text>
        </View>
      </View>
      <Button
        label="View car park"
        variant="secondary"
        onPress={() => router.push({ pathname: '/lot/[slug]', params: { slug: booking.lot.slug } })}
      />
    </Screen>
  );
}
