import { AREAS, durationsFor } from '@parkly/domain/discovery';
import { Button, Text, useTheme } from '@parkly/ui-native';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { useAuth } from '../../src/auth/AuthProvider';
import { Chip } from '../../src/components/Chip';
import { Notice } from '../../src/components/Notice';
import { PlaceSearch } from '../../src/components/PlaceSearch';
import { Screen } from '../../src/components/Screen';
import { config } from '../../src/lib/config';
import {
  dayChoices,
  durationLabel,
  initialSearch,
  stepTime,
  toParams,
  type SearchState,
} from '../../src/logic/search';

function Row({ children }: { children: React.ReactNode }) {
  const theme = useTheme();
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ gap: theme.space.inline.sm }}
    >
      {children}
    </ScrollView>
  );
}

/** D-10/D-11 Home: where and when (doc 03 §1.2) with enterprise quick-action icons. */
export default function Home() {
  const theme = useTheme();
  const router = useRouter();
  const { me, vehicles } = useAuth();
  const days = useMemo(() => dayChoices(new Date()), []);
  const [search, setSearch] = useState<SearchState>(() => initialSearch(new Date()));
  const [locating, setLocating] = useState(false);
  const [locError, setLocError] = useState<string | null>(null);
  const set = (patch: Partial<SearchState>) => setSearch((s) => ({ ...s, ...patch }));
  const defaultVehicle = vehicles?.find((v) => v.isDefault);

  async function nearMe() {
    setLocError(null);
    setLocating(true);
    try {
      const { granted } = await Location.requestForegroundPermissionsAsync();
      if (!granted) {
        setLocError('Location is off for Parkly. Pick an area instead.');
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

  const section = { gap: theme.space.stack.sm };

  return (
    <Screen
      showNav
      footer={
        <Button
          label="Find parking"
          size="lg"
          fullWidth
          onPress={() => router.push({ pathname: '/search', params: toParams(search) })}
        />
      }
    >
      <View
        style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}
      >
        <View style={{ gap: 2 }}>
          <Text variant="overline" tone="brand">
            Parkly
          </Text>
          <Text variant="heading.xl">{me?.firstName ? `Hello, ${me.firstName}` : 'Hello'}</Text>
        </View>
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
            paddingVertical: 6,
            paddingHorizontal: 12,
            borderRadius: theme.radius.full,
            backgroundColor: theme.color.bg['brand-subtle'],
            borderWidth: 1,
            borderColor: pressed ? theme.color.border.brand : theme.color.border.default,
            marginTop: 4,
          })}
        >
          <Ionicons name="car-outline" size={16} color={theme.color.text.brand} />
          <Text variant="label.sm" style={{ color: theme.color.text.brand, fontWeight: '600' }}>
            {defaultVehicle ? defaultVehicle.plateNorm : '+ Vehicle'}
          </Text>
        </Pressable>
      </View>

      {/* OPay-style Quick Action Tiles */}
      <View
        style={{
          flexDirection: 'row',
          justifyContent: 'space-between',
          backgroundColor: theme.card.bg,
          borderWidth: 1,
          borderColor: theme.card.border,
          borderRadius: theme.card.radius,
          paddingVertical: 14,
          paddingHorizontal: 10,
        }}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Scan Gate or QR"
          onPress={() => router.push('/bookings')}
          style={{ flex: 1, alignItems: 'center', gap: 6 }}
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
            <Ionicons name="qr-code-outline" size={22} color={theme.color.text.brand} />
          </View>
          <Text variant="label.sm" style={{ fontWeight: '600', fontSize: 11 }}>
            Scan Gate
          </Text>
        </Pressable>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Find parking near me"
          onPress={() => void nearMe()}
          style={{ flex: 1, alignItems: 'center', gap: 6 }}
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
            <Ionicons name="navigate-outline" size={22} color={theme.color.text.brand} />
          </View>
          <Text variant="label.sm" style={{ fontWeight: '600', fontSize: 11 }}>
            Near Me
          </Text>
        </Pressable>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="My Bookings"
          onPress={() => router.push('/bookings')}
          style={{ flex: 1, alignItems: 'center', gap: 6 }}
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
            <Ionicons name="receipt-outline" size={22} color={theme.color.text.brand} />
          </View>
          <Text variant="label.sm" style={{ fontWeight: '600', fontSize: 11 }}>
            Bookings
          </Text>
        </Pressable>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Monthly Passes"
          onPress={() => router.push('/passes')}
          style={{ flex: 1, alignItems: 'center', gap: 6 }}
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
            <Ionicons name="card-outline" size={22} color={theme.color.text.brand} />
          </View>
          <Text variant="label.sm" style={{ fontWeight: '600', fontSize: 11 }}>
            Passes
          </Text>
        </Pressable>
      </View>

      <View style={section}>
        <Text variant="label.lg">Where</Text>
        <PlaceSearch
          onPick={(p) =>
            set({ area: null, coords: { lat: p.lat, lng: p.lng }, placeLabel: p.label })
          }
        />
        <Row>
          {search.placeLabel ? (
            <Chip label={search.placeLabel} selected onPress={() => undefined} />
          ) : null}
          <Chip
            label={locating ? 'Finding you…' : 'Near me'}
            selected={search.coords !== null && search.placeLabel === null}
            onPress={() => void nearMe()}
          />
          {AREAS.map((a) => (
            <Chip
              key={a.key}
              label={a.label}
              selected={search.coords === null && search.area === a.key}
              onPress={() => set({ area: a.key, coords: null, placeLabel: null })}
            />
          ))}
        </Row>
        {locError ? <Notice kind="warning" message={locError} /> : null}
      </View>

      <View style={section}>
        <Text variant="label.lg">When</Text>
        <Row>
          {days.map((d) => (
            <Chip
              key={d.date}
              label={d.label}
              selected={search.date === d.date}
              onPress={() => set({ date: d.date })}
            />
          ))}
        </Row>
      </View>

      <View style={section}>
        <Text variant="label.lg">How long</Text>
        <Row>
          {[...durationsFor(config.testStays), 'day' as const].map((d) => (
            <Chip
              key={String(d)}
              label={durationLabel(d)}
              selected={search.duration === d}
              onPress={() => {
                if (d === '5m') {
                  const nowLagos = new Date(Date.now() + 60 * 60_000);
                  const hh = String(nowLagos.getUTCHours()).padStart(2, '0');
                  const mm = String(Math.floor(nowLagos.getUTCMinutes() / 15) * 15).padStart(
                    2,
                    '0',
                  );
                  set({ duration: d, date: days[0]?.date ?? search.date, time: `${hh}:${mm}` });
                } else {
                  set({ duration: d });
                }
              }}
            />
          ))}
        </Row>
      </View>

      {search.duration !== 'day' ? (
        <View style={section}>
          <Text variant="label.lg">Arrive at</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.space.inline.md }}>
            <Button
              label="− 15 min"
              variant="secondary"
              size="sm"
              onPress={() => set({ time: stepTime(search.time, -1) })}
            />
            <Text variant="heading.md" accessibilityLabel={`Arrive at ${search.time}`}>
              {search.time}
            </Text>
            <Button
              label="+ 15 min"
              variant="secondary"
              size="sm"
              onPress={() => set({ time: stepTime(search.time, 1) })}
            />
          </View>
        </View>
      ) : null}
    </Screen>
  );
}
