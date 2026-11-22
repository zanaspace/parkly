import { Ionicons } from '@expo/vector-icons';
import { Button, Text, useTheme } from '@parkly/ui-native';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, Switch, View } from 'react-native';

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export function PlanPassSection() {
  const theme = useTheme();
  const router = useRouter();
  const [returnTrip, setReturnTrip] = useState(false);
  const [passSubscription, setPassSubscription] = useState(false);
  const [selectedDays, setSelectedDays] = useState<string[]>(['Mon', 'Tue', 'Wed', 'Thu', 'Fri']);

  function toggleDay(day: string) {
    setSelectedDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day],
    );
  }

  return (
    <View style={{ gap: 12 }}>
      {/* Return Stay Toggle */}
      <View
        style={{
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
          paddingVertical: 2,
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

      {returnTrip ? (
        <View
          style={{
            backgroundColor: theme.color.bg['brand-subtle'],
            borderWidth: 1,
            borderColor: theme.color.border.brand,
            borderRadius: 14,
            padding: 12,
            gap: 8,
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Ionicons name="information-circle-outline" size={18} color={theme.color.text.brand} />
            <Text variant="label.sm" tone="brand" style={{ fontWeight: '700' }}>
              Multi-day & Overnight Parking
            </Text>
          </View>
          <Text variant="body.sm" tone="secondary" style={{ fontSize: 12, lineHeight: 17 }}>
            Single reservations cover stays up to 24 hours. For multi-day or overnight parking,
            subscribe to a 30-day Monthly Pass for guaranteed reserved access, or book daily slots.
          </Text>
          <Button
            label="View 30-day Monthly Passes"
            size="sm"
            variant="secondary"
            onPress={() => router.push('/passes')}
          />
        </View>
      ) : null}

      {/* Monthly Pass Toggle */}
      <View
        style={{
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
          paddingVertical: 2,
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
    </View>
  );
}
