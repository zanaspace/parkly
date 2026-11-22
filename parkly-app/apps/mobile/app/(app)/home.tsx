import { Ionicons } from '@expo/vector-icons';
import { AREAS } from '@parkly/domain/discovery';
import { Text, useTheme } from '@parkly/ui-native';
import * as Location from 'expo-location';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { useAuth } from '../../src/auth/AuthProvider';
import { Notice } from '../../src/components/Notice';
import { PlaceSearch } from '../../src/components/PlaceSearch';
import { PlanParkingCard } from '../../src/components/PlanParkingCard';
import { Screen } from '../../src/components/Screen';
import { ServiceGrid } from '../../src/components/ServiceGrid';
import {
  dayChoices,
  ensureValidStart,
  initialSearch,
  stepTime,
  toParams,
  type SearchState,
} from '../../src/logic/search';

/** D-10/D-11 Home Dashboard: Shuttlers-style sleek mobility UI. */
export default function Home() {
  const theme = useTheme();
  const router = useRouter();
  const { me, vehicles } = useAuth();
  const days = useMemo(() => dayChoices(new Date()), []);
  const [search, setSearch] = useState<SearchState>(() => initialSearch(new Date()));
  const [locating, setLocating] = useState(false);
  const [locError, setLocError] = useState<string | null>(null);
  const [searchExpanded, setSearchExpanded] = useState(false);

  const set = (patch: Partial<SearchState>) => setSearch((s) => ({ ...s, ...patch }));
  const defaultVehicle = vehicles?.find((v) => v.isDefault) ?? vehicles?.[0];

  const currentDateLabel = useMemo(() => {
    const matched = days.find((d) => d.date === search.date);
    return matched ? matched.label : search.date;
  }, [days, search.date]);

  async function nearMe() {
    setLocError(null);
    setLocating(true);
    try {
      const { granted } = await Location.requestForegroundPermissionsAsync();
      if (!granted) {
        setLocError('Location is off for Parkly. Pick a destination or area instead.');
        return;
      }
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      set({
        area: null,
        coords: { lat: pos.coords.latitude, lng: pos.coords.longitude },
        placeLabel: null,
      });
    } catch {
      setLocError('We couldn’t get your location. Pick an area instead.');
    } finally {
      setLocating(false);
    }
  }

  function handleFindParking() {
    const valid = ensureValidStart(search, new Date());
    router.push({ pathname: '/search', params: toParams(valid) });
  }

  function handlePickPlace(p: { lat: number; lng: number; label: string }) {
    const updated = {
      ...search,
      area: null,
      coords: { lat: p.lat, lng: p.lng },
      placeLabel: p.label,
    };
    const valid = ensureValidStart(updated, new Date());
    setSearch(valid);
    setSearchExpanded(false);
    router.push({ pathname: '/search', params: toParams(valid) });
  }

  return (
    <Screen showNav>
      {/* Top Header Bar: Location Pill, Support & Notifications */}
      <View
        style={{
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 8,
        }}
      >
        {/* Location Dropdown Pill */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Location: Lagos, Nigeria"
          onPress={() => setSearchExpanded((prev) => !prev)}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 4,
            backgroundColor: theme.color.bg.subtle,
            paddingVertical: 6,
            paddingHorizontal: 10,
            borderRadius: theme.radius.pill,
            flexShrink: 1,
          }}
        >
          <Ionicons name="location-sharp" size={13} color={theme.color.text.brand} />
          <Text variant="label.sm" style={{ fontWeight: '600', fontSize: 11 }} numberOfLines={1}>
            {search.placeLabel ? search.placeLabel : 'Lagos, Nigeria'}
          </Text>
          <Ionicons name="chevron-down" size={11} color={theme.color.text.secondary} />
        </Pressable>

        {/* Right Action Icons: Support & Notifications */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Help & Support"
            onPress={() => router.push('/account')}
            style={{
              width: 36,
              height: 36,
              borderRadius: 18,
              backgroundColor: theme.color.bg.subtle,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Ionicons name="headset-outline" size={18} color={theme.color.text.secondary} />
          </Pressable>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Notifications"
            onPress={() => router.push('/notifications' as never)}
            style={{
              width: 36,
              height: 36,
              borderRadius: 18,
              backgroundColor: theme.color.bg.subtle,
              alignItems: 'center',
              justifyContent: 'center',
              position: 'relative',
            }}
          >
            <Ionicons name="notifications-outline" size={18} color={theme.color.text.secondary} />
            <View
              style={{
                position: 'absolute',
                top: 6,
                right: 6,
                width: 8,
                height: 8,
                borderRadius: 4,
                backgroundColor: theme.color.status.danger.fg,
              }}
            />
          </Pressable>
        </View>
      </View>

      {/* Greeting Banner & Add Car Button */}
      <View
        style={{
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 12,
          paddingVertical: 4,
        }}
      >
        <View style={{ flex: 1, gap: 2 }}>
          <Text variant="heading.xl" style={{ fontWeight: '800' }}>
            {me?.firstName ? `Hi, ${me.firstName}` : 'Welcome to Parkly'}
          </Text>
          <Text variant="body.sm" tone="secondary">
            Find, park and access smart car parks
          </Text>
        </View>

        {/* Vehicle Button (Always visible without clipping) */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={
            defaultVehicle ? `Vehicle ${defaultVehicle.plateNorm}` : 'Add vehicle'
          }
          onPress={() => router.push(defaultVehicle ? '/account' : '/add-vehicle')}
          style={({ pressed }) => ({
            flexDirection: 'row',
            alignItems: 'center',
            gap: 6,
            paddingVertical: 8,
            paddingHorizontal: 12,
            borderRadius: theme.radius.pill,
            backgroundColor: theme.color.bg['brand-subtle'],
            borderWidth: 1,
            borderColor: pressed ? theme.color.border.brand : theme.color.border.default,
            flexShrink: 0,
          })}
        >
          <Ionicons name="car-outline" size={16} color={theme.color.text.brand} />
          <Text variant="label.sm" style={{ color: theme.color.text.brand, fontWeight: '700' }}>
            {defaultVehicle ? defaultVehicle.plateNorm : '+ Add Car'}
          </Text>
        </Pressable>
      </View>

      {/* Hero Search Bar with Live Destination Search Input */}
      <View style={{ gap: 8 }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Search destination or car park"
          onPress={() => setSearchExpanded((prev) => !prev)}
          style={({ pressed }) => ({
            flexDirection: 'row',
            alignItems: 'center',
            backgroundColor: theme.color.bg.surface,
            borderWidth: 1,
            borderColor:
              searchExpanded || pressed ? theme.color.border.brand : theme.color.border.default,
            borderRadius: 16,
            paddingVertical: 14,
            paddingHorizontal: 16,
            gap: 12,
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 2 },
            shadowOpacity: 0.05,
            shadowRadius: 8,
            elevation: 2,
          })}
        >
          <Ionicons name="search" size={20} color={theme.color.text.brand} />
          <Text
            variant="body.md"
            tone={search.placeLabel ? 'primary' : 'tertiary'}
            style={{ flex: 1, fontWeight: search.placeLabel ? '600' : '400' }}
            numberOfLines={1}
          >
            {search.placeLabel ? search.placeLabel : 'Where would you like to park?'}
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Scan gate barrier"
            onPress={() => router.push('/bookings')}
            hitSlop={8}
            style={{
              paddingLeft: 8,
              borderLeftWidth: 1,
              borderLeftColor: theme.color.border.default,
            }}
          >
            <Ionicons name="qr-code-outline" size={20} color={theme.color.text.secondary} />
          </Pressable>
        </Pressable>

        {/* Live Search Input & Dropdown when expanded */}
        {searchExpanded ? (
          <View
            style={{
              backgroundColor: theme.card.bg,
              borderWidth: 1,
              borderColor: theme.card.border,
              borderRadius: 16,
              padding: 12,
              gap: 10,
            }}
          >
            <PlaceSearch onPick={handlePickPlace} />
            <View style={{ gap: 6 }}>
              <Text variant="label.sm" tone="secondary" style={{ fontSize: 11 }}>
                Popular Lagos Areas
              </Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                {AREAS.slice(0, 5).map((a) => (
                  <Pressable
                    key={a.key}
                    accessibilityRole="button"
                    accessibilityLabel={a.label}
                    onPress={() => {
                      const updated = {
                        ...search,
                        area: a.key,
                        coords: null,
                        placeLabel: null,
                      };
                      const valid = ensureValidStart(updated, new Date());
                      setSearch(valid);
                      setSearchExpanded(false);
                      router.push({ pathname: '/search', params: toParams(valid) });
                    }}
                    style={{
                      paddingVertical: 5,
                      paddingHorizontal: 10,
                      borderRadius: theme.radius.pill,
                      borderWidth: 1,
                      borderColor: theme.color.border.default,
                      backgroundColor: theme.color.bg.surface,
                    }}
                  >
                    <Text
                      variant="label.sm"
                      style={{
                        fontSize: 11,
                        color: theme.color.text.secondary,
                        fontWeight: '500',
                      }}
                    >
                      {a.label}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>
          </View>
        ) : null}
      </View>

      {/* 6-Card Service Grid */}
      <ServiceGrid onScanPress={() => router.push('/bookings')} />

      {/* Location Error Notice */}
      {locError ? <Notice kind="warning" message={locError} /> : null}

      {/* Shuttlers-style Plan Parking Widget */}
      <PlanParkingCard
        originLabel={locating ? 'Locating your vehicle…' : search.coords ? 'Near me' : null}
        destinationLabel={search.placeLabel}
        dateLabel={currentDateLabel}
        timeLabel={search.time}
        onPickDestination={(p) =>
          set({ area: null, coords: { lat: p.lat, lng: p.lng }, placeLabel: p.label })
        }
        onClearDestination={() => set({ placeLabel: null, coords: null })}
        onStepTime={(delta) => set({ time: stepTime(search.time, delta) })}
        onFindParking={handleFindParking}
        onNearMe={() => void nearMe()}
      />

      {/* Information Banner Carousel */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: 12 }}
      >
        <View
          style={{
            width: 280,
            borderRadius: 16,
            backgroundColor: theme.color.bg['brand-subtle'],
            borderWidth: 1,
            borderColor: theme.color.border.brand,
            padding: 16,
            gap: 6,
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Ionicons name="shield-checkmark" size={16} color={theme.color.text.brand} />
            <Text variant="label.sm" tone="brand" style={{ fontWeight: '700' }}>
              LASPA Verified Rates
            </Text>
          </View>
          <Text variant="body.sm" tone="secondary">
            Guaranteed Lagos State parking tariffs. No roadside extortion or price spikes.
          </Text>
        </View>

        <View
          style={{
            width: 280,
            borderRadius: 16,
            backgroundColor: theme.card.bg,
            borderWidth: 1,
            borderColor: theme.card.border,
            padding: 16,
            gap: 6,
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Ionicons name="qr-code" size={16} color={theme.color.action.primary.bg} />
            <Text variant="label.sm" style={{ fontWeight: '700' }}>
              Instant Barrier Check-in
            </Text>
          </View>
          <Text variant="body.sm" tone="secondary">
            Show your gate QR pass or let attendant scan your ticket for zero-delay exit.
          </Text>
        </View>
      </ScrollView>
    </Screen>
  );
}
