import { AREAS, DURATIONS } from '@parkly/domain/discovery';
import { Button, Text, useTheme } from '@parkly/ui-native';
import * as Location from 'expo-location';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useAuth } from '../../src/auth/AuthProvider';
import { Chip } from '../../src/components/Chip';
import { Notice } from '../../src/components/Notice';
import { PlaceSearch } from '../../src/components/PlaceSearch';
import { Screen } from '../../src/components/Screen';
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

/** D-10/D-11 Home: where and when (doc 03 §1.2). The map arrives with the Google key. */
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
      footer={
        <>
          <Button
            label="Find parking"
            fullWidth
            onPress={() => router.push({ pathname: '/search', params: toParams(search) })}
          />
          <Button
            label="Account"
            variant="ghost"
            fullWidth
            onPress={() => router.push('/account')}
          />
        </>
      }
    >
      <Text variant="overline" tone="brand">
        Parkly
      </Text>
      <Text variant="heading.xl">{me?.firstName ? `Hello, ${me.firstName}` : 'Hello'}</Text>
      {defaultVehicle ? (
        <Text tone="secondary">
          {'Parking with '}
          <Text variant="code.md">{defaultVehicle.plateNorm}</Text>
        </Text>
      ) : (
        <Text tone="secondary">Add a vehicle in Account before your first booking.</Text>
      )}

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
          {[...DURATIONS, 'day' as const].map((d) => (
            <Chip
              key={String(d)}
              label={durationLabel(d)}
              selected={search.duration === d}
              onPress={() => set({ duration: d })}
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
