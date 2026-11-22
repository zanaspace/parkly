import { Ionicons } from '@expo/vector-icons';
import { Button, Text, useTheme } from '@parkly/ui-native';
import { useState } from 'react';
import { Pressable, Switch, View } from 'react-native';
import { PlaceSearch } from './PlaceSearch';

interface PlanParkingCardProps {
  originLabel?: string | null;
  destinationLabel?: string | null;
  dateLabel: string;
  timeLabel: string;
  onPickDestination: (p: { lat: number; lng: number; label: string }) => void;
  onClearDestination: () => void;
  onStepTime: (delta: number) => void;
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
  onPickDestination,
  onClearDestination,
  onStepTime,
  onFindParking,
  onNearMe,
}: PlanParkingCardProps) {
  const theme = useTheme();
  const [returnTrip, setReturnTrip] = useState(false);
  const [passSubscription, setPassSubscription] = useState(false);
  const [selectedDays, setSelectedDays] = useState<string[]>(['Mon', 'Tue', 'Wed', 'Thu', 'Fri']);
  const [showSearch, setShowSearch] = useState(false);

  function toggleDay(day: string) {
    setSelectedDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day],
    );
  }

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

      {/* Date & Time Selector Tiles */}
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <View
          style={{
            flex: 1,
            borderWidth: 1,
            borderColor: theme.color.border.default,
            borderRadius: 12,
            padding: 10,
            gap: 4,
            backgroundColor: theme.color.bg.surface,
          }}
        >
          <Text variant="label.sm" tone="tertiary" style={{ fontSize: 11 }}>
            Parking date
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Ionicons name="calendar-outline" size={16} color={theme.color.text.brand} />
            <Text variant="body.sm" style={{ fontWeight: '600' }} numberOfLines={1}>
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
            padding: 10,
            gap: 4,
            backgroundColor: theme.color.bg.surface,
          }}
        >
          <Text variant="label.sm" tone="tertiary" style={{ fontSize: 11 }}>
            Arrival time
          </Text>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Ionicons name="time-outline" size={16} color={theme.color.text.brand} />
              <Text variant="body.sm" style={{ fontWeight: '600' }}>
                {timeLabel}
              </Text>
            </View>
            <View style={{ flexDirection: 'row', gap: 4 }}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Minus 15 minutes"
                onPress={() => onStepTime(-1)}
                hitSlop={6}
                style={{
                  width: 20,
                  height: 20,
                  borderRadius: 10,
                  backgroundColor: theme.color.bg.subtle,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Text style={{ fontSize: 12, fontWeight: '700' }}>−</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Plus 15 minutes"
                onPress={() => onStepTime(1)}
                hitSlop={6}
                style={{
                  width: 20,
                  height: 20,
                  borderRadius: 10,
                  backgroundColor: theme.color.bg.subtle,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Text style={{ fontSize: 12, fontWeight: '700' }}>+</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </View>

      {/* Return Stay Toggle */}
      <View
        style={{
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
          paddingVertical: 4,
        }}
      >
        <View style={{ gap: 2 }}>
          <Text variant="label.md" style={{ fontWeight: '600' }}>
            Multi-day parking
          </Text>
          <Text variant="body.sm" tone="tertiary" style={{ fontSize: 11 }}>
            Overnight or multi-day stay
          </Text>
        </View>
        <Switch
          value={returnTrip}
          onValueChange={setReturnTrip}
          trackColor={{ false: theme.color.border.default, true: theme.color.action.primary.bg }}
          thumbColor="#FFFFFF"
        />
      </View>

      {/* Monthly Pass Toggle */}
      <View
        style={{
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
          paddingVertical: 4,
        }}
      >
        <View style={{ gap: 2 }}>
          <Text variant="label.md" style={{ fontWeight: '600' }}>
            Subscribe to 30-day Pass
          </Text>
          <Text variant="body.sm" tone="tertiary" style={{ fontSize: 11 }}>
            Regular recurring monthly bay
          </Text>
        </View>
        <Switch
          value={passSubscription}
          onValueChange={setPassSubscription}
          trackColor={{ false: theme.color.border.default, true: theme.color.action.primary.bg }}
          thumbColor="#FFFFFF"
        />
      </View>

      {/* Trip Days (when Pass Subscription is enabled) */}
      {passSubscription ? (
        <View style={{ gap: 8 }}>
          <Text variant="label.sm" tone="secondary">
            Parking days
          </Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
            {WEEKDAYS.map((day) => {
              const active = selectedDays.includes(day);
              return (
                <Pressable
                  key={day}
                  accessibilityRole="button"
                  accessibilityLabel={`Toggle ${day}`}
                  onPress={() => toggleDay(day)}
                  style={{
                    paddingVertical: 6,
                    paddingHorizontal: 12,
                    borderRadius: theme.radius.pill,
                    borderWidth: 1,
                    borderColor: active ? theme.color.border.brand : theme.color.border.default,
                    backgroundColor: active
                      ? theme.color.bg['brand-subtle']
                      : theme.color.bg.surface,
                  }}
                >
                  <Text
                    variant="label.sm"
                    style={{
                      color: active ? theme.color.text.brand : theme.color.text.secondary,
                      fontWeight: active ? '700' : '500',
                      fontSize: 11,
                    }}
                  >
                    {day}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      ) : null}

      {/* CTA Button */}
      <Button label="Find parking bays" size="lg" fullWidth onPress={onFindParking} />
    </View>
  );
}
