import type { PlaceSuggestion } from '@parkly/contracts';
import { Input, Text, useTheme } from '@parkly/ui-native';
import { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import { api } from '../lib/client';

/**
 * D-11 destination search (ADR 0014): suggestions from the API once typing
 * pauses for 300 ms. Picking one hands its name and position back.
 */
export function PlaceSearch({
  onPick,
}: {
  onPick: (p: { lat: number; lng: number; label: string }) => void;
}) {
  const theme = useTheme();
  const [q, setQ] = useState('');
  const [items, setItems] = useState<PlaceSuggestion[]>([]);
  const [status, setStatus] = useState<'idle' | 'loading' | 'none' | 'error'>('idle');

  useEffect(() => {
    const query = q.trim();
    if (query.length < 2) {
      setItems([]);
      setStatus('idle');
      return;
    }
    let live = true;
    const timer = setTimeout(async () => {
      setStatus('loading');
      try {
        const found = await api.places(query);
        if (!live) return;
        setItems(found);
        setStatus(found.length === 0 ? 'none' : 'idle');
      } catch {
        if (live) setStatus('error');
      }
    }, 300);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [q]);

  return (
    <View style={{ gap: theme.space.stack.xs }}>
      <Input
        label="Search a place"
        placeholder="e.g. Eko Hotel, Lekki toll gate"
        value={q}
        onChangeText={setQ}
        autoCorrect={false}
        returnKeyType="search"
      />
      {items.map((p) => (
        <Pressable
          key={p.id}
          accessibilityRole="button"
          accessibilityLabel={`${p.label}, ${p.detail}`}
          onPress={() => {
            onPick({ lat: p.lat, lng: p.lng, label: p.label });
            setQ('');
          }}
          style={({ pressed }) => ({
            paddingVertical: theme.space[2],
            paddingHorizontal: theme.space[3],
            borderRadius: theme.radius.md,
            backgroundColor: pressed ? theme.color.bg.muted : theme.color.bg.surface,
            borderWidth: 1,
            borderColor: theme.color.border.default,
          })}
        >
          <Text variant="label.md">{p.label}</Text>
          {p.detail ? (
            <Text variant="body.sm" tone="tertiary" numberOfLines={1}>
              {p.detail}
            </Text>
          ) : null}
        </Pressable>
      ))}
      {status === 'loading' ? (
        <Text variant="body.sm" tone="tertiary">
          Searching…
        </Text>
      ) : null}
      {status === 'none' ? (
        <Text variant="body.sm" tone="tertiary">
          No places found in Lagos. Try a landmark or area.
        </Text>
      ) : null}
      {status === 'error' ? (
        <Text variant="body.sm" tone="tertiary">
          Place search isn’t available right now. Pick an area instead.
        </Text>
      ) : null}
    </View>
  );
}
