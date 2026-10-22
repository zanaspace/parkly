import type { LotAvailability, PublicLot, PublicPrice, Quote } from '@parkly/contracts';
import {
  dayLabel,
  lagosWeekday,
  lineLabel,
  searchWindow,
  spacesLabel,
  windowLabel,
} from '@parkly/domain/discovery';
import { formatNaira } from '@parkly/domain/money';
import { Button, Text, useTheme } from '@parkly/ui-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Image, Linking, ScrollView, View } from 'react-native';
import { Notice } from '../../../src/components/Notice';
import { Screen } from '../../../src/components/Screen';
import { ApiError } from '../../../src/lib/api';
import { api } from '../../../src/lib/client';
import { GENERIC_ERROR_MESSAGE } from '../../../src/logic/errors';
import { fromParams } from '../../../src/logic/search';

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const AMENITY: Record<string, string> = {
  GUARD: 'Guard',
  CCTV: 'CCTV',
  LIGHTING: 'Lit at night',
  COVERED: 'Covered',
  EV: 'EV charging',
  ACCESS_CONTROL: 'Gated',
  TOILET: 'Toilet',
};
const CHECK: Record<string, string> = {
  LASPA_PERMIT: 'LASPA permit checked',
  GUARD_PRESENCE: 'Guard on duty',
  LIGHTING: 'Lighting after dark',
  CCTV: 'CCTV',
  ACCESS_CONTROL: 'Access control',
  CAPACITY_COUNT: 'Spaces counted',
  OWNER_IDENTITY: 'Owner identity checked',
  ENTRANCE_SIGNAGE: 'Entrance signage',
  FIRE_SAFETY: 'Fire safety',
};

function priceLine(p: PublicPrice): string {
  switch (p.product) {
    case 'HOURLY': {
      const cap = p.dailyCapKobo ? `, at most ${formatNaira(p.dailyCapKobo)} a day` : '';
      return `${formatNaira(p.hourlyRateKobo ?? 0)} an hour${cap}`;
    }
    case 'DAILY':
      return `${formatNaira(p.dailyRateKobo ?? 0)} a day`;
    case 'MONTHLY':
      return `${formatNaira(p.monthlyRateKobo ?? 0)} a month (30-day pass)`;
  }
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  const theme = useTheme();
  return (
    <View
      style={{
        gap: theme.space.stack.sm,
        padding: theme.card.padding,
        borderRadius: theme.card.radius,
        borderWidth: 1,
        borderColor: theme.card.border,
        backgroundColor: theme.card.bg,
      }}
    >
      <Text variant="heading.sm">{title}</Text>
      {children}
    </View>
  );
}

/** D-13 Lot detail (doc 03 §1.3): the server's price for the chosen time, hours and the verified sheet. */
export default function LotScreen() {
  const theme = useTheme();
  const router = useRouter();
  const params = useLocalSearchParams<{ slug: string }>();
  // Read the search once: the params object can change identity on every render,
  // which would re-run the loading effect in a loop.
  const [search] = useState(() => fromParams(params, new Date()));
  const slug = params.slug;
  const [lot, setLot] = useState<PublicLot | null>(null);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [availability, setAvailability] = useState<LotAvailability | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [priceError, setPriceError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const found = await api.lot(slug);
        if (!live) return;
        setLot(found);
        const window = searchWindow(search);
        try {
          const [q, a] = await Promise.all([
            api.quote(found.id, window),
            api.availability(found.id, window),
          ]);
          if (live) {
            setQuote(q);
            setAvailability(a);
          }
        } catch (err) {
          if (live) setPriceError(err instanceof ApiError ? err.message : GENERIC_ERROR_MESSAGE);
        }
      } catch (err) {
        if (live) setError(err instanceof ApiError ? err.message : GENERIC_ERROR_MESSAGE);
      }
    })();
    return () => {
      live = false;
    };
  }, [slug, search]);

  if (error)
    return (
      <Screen footer={<Button label="Back to results" fullWidth onPress={() => router.back()} />}>
        <Notice message={error} />
      </Screen>
    );
  if (!lot)
    return (
      <Screen>
        <ActivityIndicator accessibilityLabel="Loading car park" />
      </Screen>
    );

  const today = lagosWeekday(new Date());
  const directions = `https://www.google.com/maps/dir/?api=1&destination=${lot.location.lat},${lot.location.lng}`;

  return (
    <Screen
      footer={
        <>
          <Button label="Booking opens soon" fullWidth disabled />
          <Button label="Back to results" variant="ghost" fullWidth onPress={() => router.back()} />
        </>
      }
    >
      {lot.photos.length > 0 ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: theme.space.inline.sm }}
        >
          {lot.photos.map((p, i) => (
            <Image
              key={p.url}
              source={{ uri: p.url }}
              accessibilityLabel={`${lot.name}, photo ${i + 1}`}
              style={{ width: 280, height: 210, borderRadius: theme.radius.md }}
            />
          ))}
        </ScrollView>
      ) : null}

      <View style={{ gap: theme.space.stack.xs }}>
        <Text variant="heading.xl">{lot.name}</Text>
        <Text variant="body.sm" style={{ color: theme.badge.verified.fg }}>
          ✓ Verified by Parkly
        </Text>
        <Text tone="secondary">{lot.addressLine}</Text>
      </View>

      <Card title={`Your price · ${windowLabel(search)}`}>
        {priceError ? <Notice message={priceError} /> : null}
        {quote ? (
          <View style={{ gap: theme.space.stack.xs }}>
            {quote.lines.map((l, i) => (
              <View key={i} style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text variant="body.sm" style={{ flex: 1 }}>
                  {lineLabel(l)}
                </Text>
                <Text variant="body.sm">{formatNaira(l.amountKobo)}</Text>
              </View>
            ))}
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Text variant="label.lg">Total</Text>
              <Text variant="label.lg">{formatNaira(quote.totalKobo)}</Text>
            </View>
            {availability ? (
              <Text tone="secondary">
                {spacesLabel(availability.availableCount, availability.isOpen)}
              </Text>
            ) : null}
          </View>
        ) : !priceError ? (
          <ActivityIndicator accessibilityLabel="Getting the price" />
        ) : null}
      </Card>

      <Card title="Getting there">
        {lot.entranceNotes ? <Text>{lot.entranceNotes}</Text> : null}
        <Button
          label="Get directions"
          variant="secondary"
          onPress={() => void Linking.openURL(directions)}
        />
      </Card>

      <Card title="Prices">
        {lot.prices.map((p) => (
          <Text key={p.product}>{priceLine(p)}</Text>
        ))}
      </Card>

      <Card title="Opening hours">
        {WEEKDAYS.map((name, weekday) => {
          const d = lot.openingHours.find((h) => h.weekday === weekday);
          const hours = !d ? 'Closed' : d.is24h ? 'Open 24 hours' : `${d.opensAt}–${d.closesAt}`;
          return (
            <View key={name} style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Text variant={weekday === today ? 'label.md' : 'body.sm'}>{name}</Text>
              <Text variant={weekday === today ? 'label.md' : 'body.sm'}>{hours}</Text>
            </View>
          );
        })}
      </Card>

      {lot.amenities.length > 0 ? (
        <Card title="Facilities">
          <Text>{lot.amenities.map((a) => AMENITY[a] ?? a).join(' · ')}</Text>
        </Card>
      ) : null}

      <Card title="✓ Verified by Parkly">
        <Text variant="body.sm" tone="secondary">
          Visited on {dayLabel(lot.verification.verifiedOn)} · LASPA permit ending{' '}
          {lot.verification.permitNumberLast4} · run by {lot.operatorName}
        </Text>
        {lot.verification.checksPassed.map((c) => (
          <Text key={c} variant="body.sm">
            ✓ {CHECK[c] ?? c}
          </Text>
        ))}
      </Card>

      <Card title="Good to know">
        <Text variant="body.sm">Free cancellation until 30 minutes before your start time.</Text>
        <Text variant="body.sm">We hold your space for 30 minutes after your start time.</Text>
        <Text variant="body.sm">
          Staying longer? Overstay is charged per 15 minutes after a 10-minute grace.
        </Text>
      </Card>
    </Screen>
  );
}
