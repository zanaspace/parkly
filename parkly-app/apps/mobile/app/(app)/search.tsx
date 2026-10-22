import type { LotSearchResponse, LotSearchResult } from '@parkly/contracts';
import { distanceLabel, searchWindow, spacesLabel, windowLabel } from '@parkly/domain/discovery';
import { formatNaira } from '@parkly/domain/money';
import { Button, Text, useTheme } from '@parkly/ui-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Image, Pressable, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Chip } from '../../src/components/Chip';
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

  const header = (
    <View style={{ gap: theme.space.stack.sm, paddingBottom: theme.space.stack.sm }}>
      <Text variant="heading.lg">Parking near {point.place}</Text>
      <Text tone="secondary">{windowLabel(search)}</Text>
      <View style={{ flexDirection: 'row', gap: theme.space.inline.sm }}>
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
    </View>
  );

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.color.bg.canvas }}>
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
          <Button label="Change search" variant="ghost" onPress={() => router.back()} />
        }
      />
    </SafeAreaView>
  );
}
