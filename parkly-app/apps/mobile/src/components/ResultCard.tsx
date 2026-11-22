import type { LotSearchResult } from '@parkly/contracts';
import { distanceLabel, spacesLabel } from '@parkly/domain/discovery';
import { formatNaira } from '@parkly/domain/money';
import { Text, useTheme } from '@parkly/ui-native';
import { Image, Pressable, View } from 'react-native';

const AMENITY: Record<string, string> = {
  GUARD: 'Guard',
  CCTV: 'CCTV',
  LIGHTING: 'Lit at night',
  COVERED: 'Covered',
  EV: 'EV charging',
  ACCESS_CONTROL: 'Gated',
  TOILET: 'Toilet',
};

export function ResultCard({ lot, onPress }: { lot: LotSearchResult; onPress: () => void }) {
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
