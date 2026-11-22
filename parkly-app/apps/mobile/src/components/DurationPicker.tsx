import type { Duration } from '@parkly/domain/discovery';
import { Text, useTheme } from '@parkly/ui-native';
import { Pressable, ScrollView, View } from 'react-native';

export const DURATION_OPTIONS: { value: Duration; label: string }[] = [
  { value: 1, label: '1 hour' },
  { value: 2, label: '2 hours' },
  { value: 3, label: '3 hours' },
  { value: 4, label: '4 hours' },
  { value: 6, label: '6 hours' },
  { value: 8, label: '8 hours' },
  { value: 12, label: '12 hours' },
  { value: 'day', label: 'Full day' },
];

export interface DurationPickerProps {
  duration: Duration;
  onChange: (d: Duration) => void;
  title?: string;
  subtitle?: string;
}

/** Interactive duration selector with chips and +/- stepper */
export function DurationPicker({
  duration,
  onChange,
  title = 'How long are you parking?',
  subtitle = 'Choose stay duration. Price is calculated from this duration.',
}: DurationPickerProps) {
  const theme = useTheme();

  const handleStep = (delta: number) => {
    const idx = DURATION_OPTIONS.findIndex((o) => o.value === duration);
    const curIdx = idx === -1 ? 1 : idx;
    const nextIdx = Math.max(0, Math.min(DURATION_OPTIONS.length - 1, curIdx + delta));
    const nextOpt = DURATION_OPTIONS[nextIdx];
    if (nextOpt) onChange(nextOpt.value);
  };

  const displayLabel =
    duration === 'day' ? 'Full Day Parking' : `${duration} hour${duration === 1 ? '' : 's'}`;

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
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          backgroundColor: theme.color.bg.surface,
          borderRadius: 14,
          padding: 12,
          borderWidth: 1,
          borderColor: theme.color.border.default,
        }}
      >
        <View style={{ gap: 2, flex: 1 }}>
          <Text variant="label.md" tone="brand" style={{ fontWeight: '700' }}>
            {displayLabel}
          </Text>
          <Text variant="body.sm" tone="secondary" style={{ fontSize: 11 }}>
            {subtitle}
          </Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Decrease parking duration"
            onPress={() => handleStep(-1)}
            hitSlop={8}
            style={{
              width: 32,
              height: 32,
              borderRadius: 16,
              backgroundColor: theme.color.bg.subtle,
              borderWidth: 1,
              borderColor: theme.color.border.default,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Text style={{ fontSize: 16, fontWeight: '700', color: theme.color.text.primary }}>
              −
            </Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Increase parking duration"
            onPress={() => handleStep(1)}
            hitSlop={8}
            style={{
              width: 32,
              height: 32,
              borderRadius: 16,
              backgroundColor: theme.color.bg.subtle,
              borderWidth: 1,
              borderColor: theme.color.border.default,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Text style={{ fontSize: 16, fontWeight: '700', color: theme.color.text.primary }}>
              +
            </Text>
          </Pressable>
        </View>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: 8, paddingVertical: 2 }}
      >
        {DURATION_OPTIONS.map((opt) => {
          const isSelected = duration === opt.value;
          return (
            <Pressable
              key={String(opt.value)}
              accessibilityRole="button"
              accessibilityLabel={`Park for ${opt.label}`}
              onPress={() => onChange(opt.value)}
              style={{
                paddingVertical: 7,
                paddingHorizontal: 13,
                borderRadius: theme.radius.pill,
                borderWidth: 1,
                borderColor: isSelected ? theme.color.border.brand : theme.color.border.default,
                backgroundColor: isSelected
                  ? theme.color.action.primary.bg
                  : theme.color.bg.surface,
              }}
            >
              <Text
                variant="label.sm"
                style={{
                  color: isSelected ? '#FFFFFF' : theme.color.text.secondary,
                  fontWeight: isSelected ? '700' : '500',
                  fontSize: 12,
                }}
              >
                {opt.label}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}
