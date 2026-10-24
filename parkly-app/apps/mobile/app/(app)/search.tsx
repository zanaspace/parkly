import type { LotSearchResponse, LotSearchResult } from '@parkly/contracts';
import { distanceLabel, searchWindow, spacesLabel, windowLabel } from '@parkly/domain/discovery';
import { formatNaira } from '@parkly/domain/money';
import { Button, Text, useTheme } from '@parkly/ui-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Image, Pressable, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Chip } from '../../src/components/Chip';
import { LotsMap } from '../../src/components/LotsMap';
import { Notice } from '../../src/components/Notice';
import { ApiError } from '../../src/lib/api';
import { api } from '../../src/lib/client';
import { GENERIC_ERROR_MESSAGE } from '../../src/logic/errors';
import { fromParams, searchPoint, toParams, type SearchState } from '../../src/logic/search';

const AMENITY: Record<string, string> = {
  GUARD: 'Guard',
  CCTV: 'CCTV',
  LIGHTING: 'Lit at night',
  COVERED: 'Covered',
  EV: 'EV charging',
  ACCESS_CONTROL: 'Gated',
  TOILET: 'Toilet',
};

function ResultCard({ lot, onPress }: { lot: LotSearchResult; onPress: () => void }) {
  const theme = useTheme();
  const bookable = lot.isOpen && lot.isAvailable;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${lot.name}, ${distanceLabel(lot.distanceM)}, ${formatNaira(lot.quote.totalKobo)} total`}
      onPress={onPress}
      style={({ pressed }) => ({
        flexDirection: 'row',
        gap: theme.space.inline.md,
        padding: theme.space.inset.sm,
        borderRadius: theme.card.radius,
        borderWidth: 1,
        borderColor: pressed ? theme.color.border.brand : theme.card.border,
        backgroundColor: theme.card.bg,
      })}
    >
      {lot.photoUrl ? (
        <Image
          source={{ uri: lot.photoUrl }}
          style={{ width: 88, height: 88, borderRadius: theme.radius.md }}
          accessibilityIgnoresInvertColors
        />
      ) : (
        <View
          style={{
            width: 88,
            height: 88,
            borderRadius: theme.radius.md,
            backgroundColor: theme.color.bg.muted,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Text variant="heading.lg" tone="tertiary">
            P
          </Text>
        </View>
      )}
      <View style={{ flex: 1, gap: theme.space.stack.xs }}>
        <Text variant="label.lg" numberOfLines={2}>
          {lot.name}
        </Text>
        <Text variant="body.sm" tone="secondary">
          {lot.area ? `${lot.area} · ` : ''}
          {distanceLabel(lot.distanceM)}
        </Text>
        <Text variant="body.sm" style={{ color: theme.badge.verified.fg }}>
          ✓ Verified
          {lot.amenities.length > 0
            ? ` · ${lot.amenities.map((a) => AMENITY[a] ?? a).join(' · ')}`
            : ''}
        </Text>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <Text
            variant="body.sm"
            style={{
              color: bookable ? theme.color.status.success.fg : theme.color.status.danger.fg,
            }}
          >
            {spacesLabel(lot.availableCount, lot.isOpen)}
          </Text>
          <Text variant="label.lg">{formatNaira(lot.quote.totalKobo)}</Text>
        </View>
      </View>
    </Pressable>
  );
}

/** D-12 Results (doc 03 §1.2): verified LIVE lots, nearest first; widens to 3 km when empty. */
export default function Results() {
  const theme = useTheme();
  const router = useRouter();
  const params = useLocalSearchParams();
  const [search, setSearch] = useState<SearchState>(() => fromParams(params, new Date()));
  const [radiusM, setRadiusM] = useState(2000);
  const [result, setResult] = useState<LotSearchResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const point = useMemo(() => searchPoint(search), [search]);

  const load = useCallback(
    async (radius: number, autoWiden: boolean) => {
      setLoading(true);
      setError(null);
      try {
        const window = searchWindow(search);
        const query = {
          lat: point.lat,
          lng: point.lng,
          startAt: window.startAt,
          endAt: window.endAt,
          product: window.product,
          sort: search.sort,
        };
        let res = await api.searchLots({ ...query, radiusM: radius });
        let used = radius;
        if (res.items.length === 0 && autoWiden && radius === 2000) {
          res = await api.searchLots({ ...query, radiusM: 3000 });
          used = 3000;
        }
        setRadiusM(used);
        setResult(res);
      } catch (err) {
        setError(err instanceof ApiError ? err.message : GENERIC_ERROR_MESSAGE);
      } finally {
        setLoading(false);
      }
    },
    [search, point],
  );

  useEffect(() => {
    void load(2000, true);
  }, [load]);

  // Stable inputs so the map WebView only reloads when the results change.
  const pins = useMemo(
    () =>
      (result?.items ?? []).map((lot) => ({
        id: lot.id,
        lat: lot.location.lat,
        lng: lot.location.lng,
        label: formatNaira(lot.quote.totalKobo),
      })),
    [result],
  );
  const centre = useMemo(() => ({ lat: point.lat, lng: point.lng }), [point]);
  const openLot = (id: string) => {
    const lot = result?.items.find((l) => l.id === id);
    if (lot)
      router.push({ pathname: '/lot/[slug]', params: { slug: lot.slug, ...toParams(search) } });
  };

  const header = (
    <View style={{ gap: theme.space.stack.sm, paddingBottom: theme.space.stack.sm }}>
      <View style={{ flexDirection: 'row', gap: theme.space.inline.sm, alignItems: 'center' }}>
        <Chip
          label="Nearest"
          selected={search.sort === 'distance'}
          onPress={() => setSearch((s) => ({ ...s, sort: 'distance' }))}
        />
        <Chip
          label="Cheapest"
          selected={search.sort === 'price'}
          onPress={() => setSearch((s) => ({ ...s, sort: 'price' }))}
        />
      </View>
      {error ? <Notice message={error} /> : null}
      {result && result.items.length > 0 ? (
        <Text variant="body.sm" tone="secondary">
          {result.items.length} verified car park{result.items.length === 1 ? '' : 's'} within{' '}
          {radiusM / 1000} km · totals include Parkly’s service fee
        </Text>
      ) : null}
      {pins.length > 0 ? <LotsMap pins={pins} centre={centre} showCentre onOpen={openLot} /> : null}
    </View>
  );

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.color.bg.canvas }} edges={['top', 'left', 'right']}>
      {/* Pinned Top Search Bar — Gold Standard: Always accessible without scrolling */}
      <View
        style={{
          paddingHorizontal: theme.space.layout.gutter,
          paddingTop: theme.space.stack.xs,
          paddingBottom: theme.space.stack.xs,
          backgroundColor: theme.color.bg.canvas,
          borderBottomWidth: 1,
          borderBottomColor: theme.color.border.default,
        }}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Change search: near ${point.place}, ${windowLabel(search)}`}
          accessibilityHint="Tap to edit search location or parking time"
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/home'))}
          style={({ pressed }) => ({
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            backgroundColor: theme.card.bg,
            borderRadius: theme.card.radius,
            borderWidth: 1,
            borderColor: pressed ? theme.color.border.brand : theme.card.border,
            paddingVertical: 10,
            paddingHorizontal: theme.space.inset.md,
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 1 },
            shadowOpacity: 0.05,
            shadowRadius: 3,
            elevation: 2,
          })}
        >
          <View style={{ flex: 1, marginRight: theme.space.inline.sm, gap: 2 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Text variant="label.lg" numberOfLines={1} style={{ flexShrink: 1 }}>
                📍 {point.place}
              </Text>
            </View>
            <Text variant="body.sm" tone="secondary" numberOfLines={1}>
              {windowLabel(search)}
            </Text>
          </View>
          <View
            style={{
              paddingHorizontal: 12,
              paddingVertical: 6,
              borderRadius: theme.radius.full,
              backgroundColor: theme.color.bg['brand-subtle'],
              borderWidth: 1,
              borderColor: theme.color.border.brand,
            }}
          >
            <Text
              variant="label.sm"
              style={{ color: theme.color.text.brand, fontWeight: '600' }}
            >
              Change
            </Text>
          </View>
        </Pressable>
      </View>

      <FlatList
        data={result?.items ?? []}
        keyExtractor={(lot) => lot.id}
        contentContainerStyle={{ padding: theme.space.layout.gutter, gap: theme.space.stack.sm }}
        ListHeaderComponent={header}
        refreshing={loading && result !== null}
        onRefresh={() => void load(radiusM, false)}
        renderItem={({ item }) => (
          <ResultCard
            lot={item}
            onPress={() =>
              router.push({
                pathname: '/lot/[slug]',
                params: { slug: item.slug, ...toParams(search) },
              })
            }
          />
        )}
        ListEmptyComponent={
          loading ? (
            <ActivityIndicator accessibilityLabel="Searching" />
          ) : error ? (
            <Button
              label="Try again"
              variant="secondary"
              onPress={() => void load(radiusM, true)}
            />
          ) : (
            <View style={{ gap: theme.space.stack.sm }}>
              <Text variant="label.lg">
                No verified car parks within {radiusM / 1000} km for that time
              </Text>
              <Text tone="secondary">
                Try a wider area or a different time. Parkly only lists car parks we have checked.
              </Text>
              {radiusM < 5000 ? (
                <Button
                  label="Search within 5 km"
                  variant="secondary"
                  onPress={() => void load(5000, false)}
                />
              ) : null}
            </View>
          )
        }
        ListFooterComponent={
          <Button
            label="Search another area"
            variant="ghost"
            onPress={() => (router.canGoBack() ? router.back() : router.replace('/home'))}
          />
        }
      />
    </SafeAreaView>
  );
}
