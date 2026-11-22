import { Ionicons } from '@expo/vector-icons';
import type { Booking } from '@parkly/contracts';
import { Button, Text, useTheme } from '@parkly/ui-native';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';
import { useAuth } from '../../src/auth/AuthProvider';
import { BookingTimelineCard } from '../../src/components/BookingTimelineCard';
import { Notice } from '../../src/components/Notice';
import { Screen } from '../../src/components/Screen';
import { ApiError } from '../../src/lib/api';
import { api, tickets } from '../../src/lib/client';
import { upcomingTabLabel } from '../../src/logic/booking-tabs';
import { GENERIC_ERROR_MESSAGE } from '../../src/logic/errors';

/** My bookings (FR-BOOK-004): Shuttlers-style vertical timeline list (image copy 2.png). */
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
      <Text variant="heading.xl" style={{ fontWeight: '800' }}>
        My bookings
      </Text>

      {/* Shuttlers-style Underline Tab Bar */}
      <View
        style={{
          flexDirection: 'row',
          borderBottomWidth: 1,
          borderBottomColor: theme.color.border.default,
        }}
      >
        <Pressable
          accessibilityRole="tab"
          accessibilityState={{ selected: tab === 'upcoming' }}
          accessibilityLabel={activeTabLabel}
          onPress={() => setTab('upcoming')}
          style={{
            flex: 1,
            alignItems: 'center',
            justifyContent: 'center',
            paddingVertical: 12,
            paddingHorizontal: 8,
            borderBottomWidth: 2,
            borderBottomColor: tab === 'upcoming' ? theme.color.action.primary.bg : 'transparent',
          }}
        >
          <Text
            variant="label.md"
            numberOfLines={1}
            style={{
              color: tab === 'upcoming' ? theme.color.text.brand : theme.color.text.secondary,
              fontWeight: tab === 'upcoming' ? '700' : '500',
            }}
          >
            {activeTabLabel}
          </Text>
        </Pressable>

        <Pressable
          accessibilityRole="tab"
          accessibilityState={{ selected: tab === 'past' }}
          accessibilityLabel="Completed & Past"
          onPress={() => setTab('past')}
          style={{
            flex: 1,
            alignItems: 'center',
            justifyContent: 'center',
            paddingVertical: 12,
            paddingHorizontal: 8,
            borderBottomWidth: 2,
            borderBottomColor: tab === 'past' ? theme.color.action.primary.bg : 'transparent',
          }}
        >
          <Text
            variant="label.md"
            numberOfLines={1}
            style={{
              color: tab === 'past' ? theme.color.text.brand : theme.color.text.secondary,
              fontWeight: tab === 'past' ? '700' : '500',
            }}
          >
            Completed
          </Text>
        </Pressable>
      </View>

      {offline ? (
        <Notice kind="info" message="You’re offline. Showing the tickets saved on your phone." />
      ) : null}

      {error ? <Notice message={error} /> : null}

      {!items && !error ? <ActivityIndicator accessibilityLabel="Loading bookings" /> : null}

      {/* Empty State */}
      {items && items.length === 0 ? (
        <View style={{ alignItems: 'center', paddingVertical: 40, gap: 14 }}>
          <View
            style={{
              width: 64,
              height: 64,
              borderRadius: 32,
              backgroundColor: theme.color.bg.subtle,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Ionicons name="car-outline" size={32} color={theme.color.text.secondary} />
          </View>
          <View style={{ alignItems: 'center', gap: 4 }}>
            <Text variant="heading.sm" style={{ fontWeight: '700' }}>
              {tab === 'upcoming' ? 'No active bookings' : 'No past trips yet'}
            </Text>
            <Text variant="body.sm" tone="tertiary" style={{ textAlign: 'center' }}>
              {tab === 'upcoming'
                ? 'Reserve a spot in advance or scan at the barrier.'
                : 'Your completed parking history will appear here.'}
            </Text>
          </View>
          {tab === 'upcoming' ? (
            <Button label="Find parking bays" size="sm" onPress={() => router.push('/search')} />
          ) : null}
        </View>
      ) : null}

      {/* Timeline Booking Cards */}
      {items?.map((b) => (
        <BookingTimelineCard
          key={b.id}
          booking={b}
          onPress={() => router.push({ pathname: '/booking/[id]', params: { id: b.id } })}
        />
      ))}
    </Screen>
  );
}
