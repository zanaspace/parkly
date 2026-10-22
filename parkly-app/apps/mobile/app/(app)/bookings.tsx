import type { Booking } from '@parkly/contracts';
import { formatNaira } from '@parkly/domain/money';
import { Button, Text, useTheme } from '@parkly/ui-native';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';
import { Chip } from '../../src/components/Chip';
import { Notice } from '../../src/components/Notice';
import { Screen } from '../../src/components/Screen';
import { ApiError } from '../../src/lib/api';
import { api } from '../../src/lib/client';
import { bookingWindowLabel, statusLabel } from '@parkly/domain/booking';
import { GENERIC_ERROR_MESSAGE } from '../../src/logic/errors';

/** My bookings (FR-BOOK-004): upcoming first, then past. */
export default function MyBookings() {
  const theme = useTheme();
  const router = useRouter();
  const [tab, setTab] = useState<'upcoming' | 'past'>('upcoming');
  const [items, setItems] = useState<Booking[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    setItems(null);
    setError(null);
    api
      .bookings(tab)
      .then((rows) => live && setItems(rows))
      .catch((err: unknown) => {
        if (live) setError(err instanceof ApiError ? err.message : GENERIC_ERROR_MESSAGE);
      });
    return () => {
      live = false;
    };
  }, [tab]);

  return (
    <Screen
      footer={<Button label="Find parking" fullWidth onPress={() => router.replace('/home')} />}
    >
      <Text variant="heading.xl">My bookings</Text>
      <View style={{ flexDirection: 'row', gap: theme.space.inline.sm }}>
        <Chip label="Upcoming" selected={tab === 'upcoming'} onPress={() => setTab('upcoming')} />
        <Chip label="Past" selected={tab === 'past'} onPress={() => setTab('past')} />
      </View>
      {error ? <Notice message={error} /> : null}
      {!items && !error ? <ActivityIndicator accessibilityLabel="Loading bookings" /> : null}
      {items && items.length === 0 ? (
        <Text tone="secondary">
          {tab === 'upcoming' ? 'No upcoming bookings yet.' : 'Nothing here yet.'}
        </Text>
      ) : null}
      {items?.map((b) => (
        <Pressable
          key={b.id}
          accessibilityRole="button"
          accessibilityLabel={`${b.lot.name}, ${bookingWindowLabel(b)}, ${statusLabel(b.status)}`}
          onPress={() => router.push({ pathname: '/booking/[id]', params: { id: b.id } })}
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
              {b.lot.name}
            </Text>
            <Text variant="code.md">{b.code}</Text>
          </View>
          <Text variant="body.sm">{bookingWindowLabel(b)}</Text>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Text variant="body.sm" tone="secondary">
              {statusLabel(b.status)} · {b.vehicle.plate}
            </Text>
            <Text variant="body.sm">{formatNaira(b.totalKobo)}</Text>
          </View>
        </Pressable>
      ))}
    </Screen>
  );
}
