import type { Booking } from '@parkly/contracts';
import { formatNaira } from '@parkly/domain/money';
import { Text, useTheme } from '@parkly/ui-native';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';
import { Chip } from '../../src/components/Chip';
import { Notice } from '../../src/components/Notice';
import { Screen } from '../../src/components/Screen';
import { ApiError } from '../../src/lib/api';
import { api, tickets } from '../../src/lib/client';
import { useAuth } from '../../src/auth/AuthProvider';
import { bookingWindowLabel, statusLabel } from '@parkly/domain/booking';
import { GENERIC_ERROR_MESSAGE } from '../../src/logic/errors';

/** My bookings (FR-BOOK-004): upcoming first, then past. */
export default function MyBookings() {
  const theme = useTheme();
  const router = useRouter();
  const [tab, setTab] = useState<'upcoming' | 'past'>('upcoming');
  const [items, setItems] = useState<Booking[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [offline, setOffline] = useState(false);
  const { me } = useAuth();
  const userId = me?.id;

  useEffect(() => {
    let live = true;
    setItems(null);
    setError(null);
    setOffline(false);
    api
      .bookings(tab)
      .then((rows) => {
        if (!live) return;
        setItems(rows);
        if (tab === 'upcoming' && userId) void tickets.save(userId, rows).catch(() => undefined);
      })
      .catch(async (err: unknown) => {
        if (!live) return;
        // Offline: the upcoming tab falls back to the tickets saved on the phone.
        if (err instanceof ApiError && err.status === 0 && tab === 'upcoming' && userId) {
          const saved = await tickets.all(userId).catch(() => []);
          if (saved.length > 0) {
            setItems(saved);
            setOffline(true);
            return;
          }
        }
        setError(err instanceof ApiError ? err.message : GENERIC_ERROR_MESSAGE);
      });
    return () => {
      live = false;
    };
  }, [tab, userId]);

  return (
    <Screen showNav>
      <Text variant="heading.xl">My bookings</Text>
      <View style={{ flexDirection: 'row', gap: theme.space.inline.sm }}>
        <Chip label="Upcoming" selected={tab === 'upcoming'} onPress={() => setTab('upcoming')} />
        <Chip label="Past" selected={tab === 'past'} onPress={() => setTab('past')} />
      </View>
      {offline ? (
        <Notice kind="info" message="You’re offline. Showing the tickets saved on your phone." />
      ) : null}
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
