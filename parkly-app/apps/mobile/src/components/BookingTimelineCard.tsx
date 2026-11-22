import { Ionicons } from '@expo/vector-icons';
import type { Booking } from '@parkly/contracts';
import { bookingWindowLabel, statusLabel } from '@parkly/domain/booking';
import { formatNaira } from '@parkly/domain/money';
import { Text, useTheme } from '@parkly/ui-native';
import { Pressable, View } from 'react-native';

interface BookingTimelineCardProps {
  booking: Booking;
  onPress: () => void;
}

/** Shuttlers-style vertical timeline booking card (image copy 2.png). */
export function BookingTimelineCard({ booking: b, onPress }: BookingTimelineCardProps) {
  const theme = useTheme();

  const isCheckedIn = b.status === 'CHECKED_IN';
  const isCompleted = b.status === 'COMPLETED';
  const isCancelled = b.status === 'CANCELLED';
  const isPending = b.status === 'PENDING_PAYMENT';

  const statusBg = isCheckedIn
    ? theme.color.bg['brand-subtle']
    : isCompleted
      ? theme.color.status.success.bg
      : isCancelled
        ? theme.color.status.danger.bg
        : isPending
          ? theme.color.status.warning.bg
          : theme.color.bg.subtle;

  const statusFg = isCheckedIn
    ? theme.color.text.brand
    : isCompleted
      ? theme.color.status.success.fg
      : isCancelled
        ? theme.color.status.danger.fg
        : isPending
          ? theme.color.status.warning.fg
          : theme.color.text.secondary;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${b.lot.name}, ${bookingWindowLabel(b)}, ${statusLabel(b.status)}`}
      onPress={onPress}
      style={({ pressed }) => ({
        backgroundColor: theme.card.bg,
        borderWidth: 1,
        borderColor: pressed ? theme.color.border.brand : theme.card.border,
        borderRadius: 18,
        padding: 16,
        gap: 12,
      })}
    >
      {/* Top Header: Code & Status */}
      <View
        style={{
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 8,
        }}
      >
        <View
          style={{
            flex: 1,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 6,
            minWidth: 0,
            marginRight: 4,
          }}
        >
          <View
            style={{
              paddingVertical: 3,
              paddingHorizontal: 8,
              borderRadius: theme.radius.sm,
              backgroundColor: theme.color.bg.subtle,
              flexShrink: 0,
            }}
          >
            <Text variant="code.sm" style={{ fontWeight: '700' }}>
              #{b.code}
            </Text>
          </View>
          <Text
            variant="body.sm"
            tone="tertiary"
            style={{ fontSize: 11, flexShrink: 1 }}
            numberOfLines={1}
            ellipsizeMode="tail"
          >
            Single Booking
          </Text>
        </View>

        <View
          style={{
            paddingVertical: 3,
            paddingHorizontal: 8,
            borderRadius: theme.radius.full,
            backgroundColor: statusBg,
            flexShrink: 0,
          }}
        >
          <Text
            variant="label.sm"
            style={{
              color: statusFg,
              fontWeight: '700',
              fontSize: 10,
            }}
            numberOfLines={1}
          >
            {statusLabel(b.status)}
          </Text>
        </View>
      </View>

      {/* Vertical Route Connector */}
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12 }}>
        {/* Connector Column */}
        <View style={{ alignItems: 'center', width: 14, paddingTop: 4 }}>
          {/* Green In-Point */}
          <View
            style={{
              width: 14,
              height: 14,
              borderRadius: 7,
              borderWidth: 3,
              borderColor: theme.color.text.brand,
              backgroundColor: theme.color.bg.surface,
            }}
          />
          {/* Dashed Vertical Line */}
          <View
            style={{
              height: 26,
              borderLeftWidth: 2,
              borderLeftColor: theme.color.border.default,
              borderStyle: 'dashed',
              marginVertical: 2,
            }}
          />
          {/* Blue Out-Point */}
          <View
            style={{
              width: 14,
              height: 14,
              borderRadius: 7,
              backgroundColor: theme.color.action.primary.bg,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Ionicons name="location" size={9} color="#FFFFFF" />
          </View>
        </View>

        {/* Details Column */}
        <View style={{ flex: 1, gap: 10 }}>
          {/* Entrance */}
          <View style={{ gap: 2 }}>
            <Text variant="label.sm" tone="tertiary" style={{ fontSize: 10 }}>
              Entry Gate & Car Park
            </Text>
            <Text variant="label.md" style={{ fontWeight: '700' }} numberOfLines={1}>
              {b.lot.name}
            </Text>
          </View>

          {/* Exit */}
          <View style={{ gap: 2 }}>
            <Text variant="label.sm" tone="tertiary" style={{ fontSize: 10 }}>
              Exit Barrier / Settlement
            </Text>
            <Text variant="body.sm" tone="secondary" numberOfLines={1}>
              Standard Exit Barrier
            </Text>
          </View>
        </View>
      </View>

      {/* Divider */}
      <View
        style={{
          height: 1,
          backgroundColor: theme.color.border.default,
          marginVertical: 2,
        }}
      />

      {/* Bottom Footer: Vehicle Plate, Schedule & Price */}
      <View
        style={{
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 8,
        }}
      >
        <View
          style={{
            flex: 1,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 6,
            minWidth: 0,
            marginRight: 6,
          }}
        >
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 4,
              paddingVertical: 3,
              paddingHorizontal: 6,
              borderRadius: theme.radius.sm,
              backgroundColor: theme.color.bg.subtle,
              flexShrink: 0,
            }}
          >
            <Ionicons name="car-outline" size={13} color={theme.color.text.brand} />
            <Text variant="code.sm" style={{ fontWeight: '600', fontSize: 11 }}>
              {b.vehicle.plate}
            </Text>
          </View>
          <Text
            variant="body.sm"
            tone="secondary"
            style={{ fontSize: 11, flex: 1, flexShrink: 1 }}
            numberOfLines={1}
            ellipsizeMode="tail"
          >
            {bookingWindowLabel(b)}
          </Text>
        </View>

        <Text variant="label.md" style={{ fontWeight: '700', flexShrink: 0 }}>
          {formatNaira(b.totalKobo)}
        </Text>
      </View>
    </Pressable>
  );
}
