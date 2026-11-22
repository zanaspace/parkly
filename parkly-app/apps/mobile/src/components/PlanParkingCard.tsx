import { Ionicons } from '@expo/vector-icons';
import { Button, Text, useTheme } from '@parkly/ui-native';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, Switch, View } from 'react-native';
import { PlaceSearch } from './PlaceSearch';
import { PlanPassSection } from './PlanPassSection';

interface PlanParkingCardProps {
  originLabel?: string | null;
  destinationLabel?: string | null;
  dateLabel: string;
  timeLabel: string;
  durationLabel?: string;
  onPickDestination: (p: { lat: number; lng: number; label: string }) => void;
  onClearDestination: () => void;
  onStepTime: (delta: number) => void;
  onStepDuration?: (delta: number) => void;
  onFindParking: () => void;
  onNearMe: () => void;
}

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/** Connected origin/destination stay planner (inspired by Shuttlers UI). */
export function PlanParkingCard({
  originLabel,
  destinationLabel,
  dateLabel,
  timeLabel,
  durationLabel,
  onPickDestination,
  onClearDestination,
  onStepTime,
  onStepDuration,
  onFindParking,
  onNearMe,
}: PlanParkingCardProps) {
  const theme = useTheme();
  const [showSearch, setShowSearch] = useState(false);

  return (
    <View
      style={{
        backgroundColor: theme.card.bg,
        borderWidth: 1,
        borderColor: theme.card.border,
        borderRadius: 20,
        padding: 16,
        gap: 14,
      }}
    >
      <Text variant="heading.sm" style={{ fontWeight: '700' }}>
        Plan your parking
      </Text>

      {/* Connected 2-Stop Card */}
      <View
        style={{
          borderWidth: 1,
          borderColor: theme.color.border.default,
          borderRadius: 14,
          padding: 12,
          position: 'relative',
          backgroundColor: theme.color.bg.surface,
        }}
      >
        {/* Origin Row */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
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
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Origin location"
            onPress={onNearMe}
            style={{ flex: 1 }}
          >
            <Text variant="body.sm" style={{ fontWeight: '600' }} numberOfLines={1}>
              {originLabel || 'Current Location (Near me)'}
            </Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Refresh current location"
            onPress={onNearMe}
            hitSlop={8}
          >
            <Ionicons name="navigate-outline" size={16} color={theme.color.text.brand} />
          </Pressable>
        </View>

        {/* Dotted Connector */}
        <View
          style={{
            marginLeft: 5,
            height: 22,
            borderLeftWidth: 2,
            borderLeftColor: theme.color.border.default,
            borderStyle: 'dashed',
            marginVertical: 4,
          }}
        />

        {/* Destination Row */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
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
            <Ionicons name="location" size={10} color="#FFFFFF" />
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Destination car park"
            onPress={() => setShowSearch((s) => !s)}
            style={{ flex: 1 }}
          >
            <Text
              variant="body.sm"
              tone={destinationLabel ? 'primary' : 'tertiary'}
              style={{ fontWeight: destinationLabel ? '600' : '400' }}
              numberOfLines={1}
            >
              {destinationLabel || 'Search destination car park'}
            </Text>
          </Pressable>
          {destinationLabel ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Clear destination"
              onPress={onClearDestination}
              hitSlop={8}
            >
              <Ionicons name="close-circle" size={18} color={theme.color.text.secondary} />
            </Pressable>
          ) : (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Open destination search"
              onPress={() => setShowSearch((s) => !s)}
              hitSlop={8}
            >
              <Ionicons name="search-outline" size={18} color={theme.color.text.secondary} />
            </Pressable>
          )}
        </View>
      </View>

      {/* Destination Autocomplete popup when expanded */}
      {showSearch ? (
        <View style={{ marginTop: -4 }}>
          <PlaceSearch
            onPick={(p) => {
              onPickDestination(p);
              setShowSearch(false);
            }}
          />
        </View>
      ) : null}

      {/* Date, Time & Duration Selector Tiles */}
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <View
          style={{
            flex: 1,
            borderWidth: 1,
            borderColor: theme.color.border.default,
            borderRadius: 12,
            padding: 8,
            gap: 4,
            backgroundColor: theme.color.bg.surface,
          }}
        >
          <Text variant="label.sm" tone="tertiary" style={{ fontSize: 10 }}>
            Date
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <Ionicons name="calendar-outline" size={14} color={theme.color.text.brand} />
            <Text variant="body.sm" style={{ fontWeight: '600', fontSize: 12 }} numberOfLines={1}>
              {dateLabel}
            </Text>
          </View>
        </View>

        <View
          style={{
            flex: 1,
            borderWidth: 1,
            borderColor: theme.color.border.default,
            borderRadius: 12,
            padding: 8,
            gap: 4,
            backgroundColor: theme.color.bg.surface,
          }}
        >
          <Text variant="label.sm" tone="tertiary" style={{ fontSize: 10 }}>
            Arrival
          </Text>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Ionicons name="time-outline" size={14} color={theme.color.text.brand} />
              <Text variant="body.sm" style={{ fontWeight: '600', fontSize: 12 }}>
                {timeLabel}
              </Text>
            </View>
            <View style={{ flexDirection: 'row', gap: 2 }}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Minus 15 minutes"
                onPress={() => onStepTime(-1)}
                hitSlop={6}
                style={{
                  width: 18,
                  height: 18,
                  borderRadius: 9,
                  backgroundColor: theme.color.bg.subtle,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Text style={{ fontSize: 11, fontWeight: '700' }}>−</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Plus 15 minutes"
                onPress={() => onStepTime(1)}
                hitSlop={6}
                style={{
                  width: 18,
                  height: 18,
                  borderRadius: 9,
                  backgroundColor: theme.color.bg.subtle,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Text style={{ fontSize: 11, fontWeight: '700' }}>+</Text>
              </Pressable>
            </View>
          </View>
        </View>

        {durationLabel && onStepDuration ? (
          <View
            style={{
              flex: 1,
              borderWidth: 1,
              borderColor: theme.color.border.default,
              borderRadius: 12,
              padding: 8,
              gap: 4,
              backgroundColor: theme.color.bg.surface,
            }}
          >
            <Text variant="label.sm" tone="tertiary" style={{ fontSize: 10 }}>
              Duration
            </Text>
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <Ionicons name="hourglass-outline" size={14} color={theme.color.text.brand} />
                <Text variant="body.sm" style={{ fontWeight: '600', fontSize: 12 }}>
                  {durationLabel}
                </Text>
              </View>
              <View style={{ flexDirection: 'row', gap: 2 }}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Minus 1 hour"
                  onPress={() => onStepDuration(-1)}
                  hitSlop={6}
                  style={{
                    width: 18,
                    height: 18,
                    borderRadius: 9,
                    backgroundColor: theme.color.bg.subtle,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Text style={{ fontSize: 11, fontWeight: '700' }}>−</Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Plus 1 hour"
                  onPress={() => onStepDuration(1)}
                  hitSlop={6}
                  style={{
                    width: 18,
                    height: 18,
                    borderRadius: 9,
                    backgroundColor: theme.color.bg.subtle,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Text style={{ fontSize: 11, fontWeight: '700' }}>+</Text>
                </Pressable>
              </View>
            </View>
          </View>
        ) : null}
      </View>

      <PlanPassSection />

      {/* CTA Button */}
      <Button label="Find parking bays" size="lg" fullWidth onPress={onFindParking} />
    </View>
  );
}
