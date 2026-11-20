import { Ionicons } from '@expo/vector-icons';
import type { Booking } from '@parkly/contracts';
import { bookingWindowLabel, statusLabel } from '@parkly/domain/booking';
import { formatNaira } from '@parkly/domain/money';
import { Text, useTheme } from '@parkly/ui-native';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';
import { useAuth } from '../../src/auth/AuthProvider';
import { Chip } from '../../src/components/Chip';
import { Notice } from '../../src/components/Notice';
import { Screen } from '../../src/components/Screen';
import { ApiError } from '../../src/lib/api';
import { api, tickets } from '../../src/lib/client';
import { upcomingTabLabel } from '../../src/logic/booking-tabs';
import { GENERIC_ERROR_MESSAGE } from '../../src/logic/errors';

/** My bookings (FR-BOOK-004): upcoming first, then past. Enterprise OPay-style cards. */
export default function MyBookings() {
  const theme = useTheme();
  const router = useRouter();
  const [tab, setTab] = useState<'upcoming' | 'past'>('upcoming');
  const [items, setItems] = useState<Booking[] | null>(null);
  const [liveItems, setLiveItems] = useState<Booking[] | null>(null);
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
        if (tab === 'upcoming') {
          setLiveItems(rows);
          if (userId) void tickets.save(userId, rows).catch(() => undefined);
        }
      })
      .catch(async (err: unknown) => {
        if (!live) return;
        // Offline: the upcoming tab falls back to the tickets saved on the phone.
        if (err instanceof ApiError && err.status === 0 && tab === 'upcoming' && userId) {
          const saved = await tickets.all(userId).catch(() => []);
          if (saved.length > 0) {
            setItems(saved);
            setLiveItems(saved);
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

  const activeTabLabel = upcomingTabLabel(tab === 'upcoming' ? items : liveItems);

  return (
    <Screen showNav>
      <Text variant="heading.xl">My bookings</Text>
      <View style={{ flexDirection: 'row', gap: theme.space.inline.sm }}>
        <Chip
          label={activeTabLabel}
          selected={tab === 'upcoming'}
          onPress={() => setTab('upcoming')}
        />
        <Chip label="Past" selected={tab === 'past'} onPress={() => setTab('past')} />
      </View>
      {offline ? (
        <Notice kind="info" message="You’re offline. Showing the tickets saved on your phone." />
      ) : null}
      {error ? <Notice message={error} /> : null}
      {!items && !error ? <ActivityIndicator accessibilityLabel="Loading bookings" /> : null}
      {items && items.length === 0 ? (
        <Text tone="secondary">
          {tab === 'upcoming'
            ? `No ${activeTabLabel.toLowerCase()} bookings yet.`
            : 'Nothing here yet.'}
        </Text>
      ) : null}
      {items?.map((b) => (
        <Pressable
          key={b.id}
          accessibilityRole="button"
          accessibilityLabel={`${b.lot.name}, ${bookingWindowLabel(b)}, ${statusLabel(b.status)}`}
          onPress={() => router.push({ pathname: '/booking/[id]', params: { id: b.id } })}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 12,
            padding: theme.card.padding,
            borderRadius: theme.card.radius,
            borderWidth: 1,
            borderColor: theme.card.border,
            backgroundColor: theme.card.bg,
          }}
        >
          <View
            style={{
              width: 44,
              height: 44,
              borderRadius: 22,
              backgroundColor: theme.color.bg['brand-subtle'],
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Ionicons
              name={
                b.status === 'CHECKED_IN'
                  ? 'time-outline'
                  : b.status === 'COMPLETED'
                    ? 'checkmark-circle-outline'
                    : 'car-outline'
              }
              size={22}
              color={theme.color.text.brand}
            />
          </View>
          <View style={{ flex: 1, gap: 2 }}>
            <View
              style={{
                flexDirection: 'row',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <Text variant="label.md" style={{ flex: 1 }} numberOfLines={1}>
                {b.lot.name}
              </Text>
              <Text variant="code.sm">{b.code}</Text>
            </View>
            <Text variant="body.sm" tone="secondary">
              {bookingWindowLabel(b)}
            </Text>
            <View
              style={{
                flexDirection: 'row',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginTop: 2,
              }}
            >
              <Text variant="label.sm" tone={b.status === 'CHECKED_IN' ? 'brand' : 'secondary'}>
                {statusLabel(b.status)} · {b.vehicle.plate}
              </Text>
              <Text variant="label.sm" style={{ fontWeight: '600' }}>
                {formatNaira(b.totalKobo)}
              </Text>
            </View>
          </View>
        </Pressable>
      ))}
    </Screen>
  );
}
