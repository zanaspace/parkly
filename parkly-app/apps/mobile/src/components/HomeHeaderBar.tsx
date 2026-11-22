import { Ionicons } from '@expo/vector-icons';
import { Text, useTheme } from '@parkly/ui-native';
import { Pressable, View } from 'react-native';
import { useProfileMode } from '../context/ProfileModeContext';

interface HomeHeaderBarProps {
  placeLabel?: string | null;
  onPressLocation: () => void;
  onPressSupport: () => void;
  onPressNotifications: () => void;
}

/** Header navigation bar for Home screen with instant profile switcher. */
export function HomeHeaderBar({
  placeLabel,
  onPressLocation,
  onPressSupport,
  onPressNotifications,
}: HomeHeaderBarProps) {
  const theme = useTheme();
  const { mode, isCorporate, corporateJoined, setMode } = useProfileMode();

  return (
    <View
      style={{
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: 8,
      }}
    >
      {/* Location Dropdown Pill */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Location: Lagos, Nigeria"
        onPress={onPressLocation}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 4,
          backgroundColor: theme.color.bg.subtle,
          paddingVertical: 6,
          paddingHorizontal: 10,
          borderRadius: theme.radius.pill,
          flexShrink: 1,
        }}
      >
        <Ionicons name="location-sharp" size={13} color={theme.color.text.brand} />
        <Text variant="label.sm" style={{ fontWeight: '600', fontSize: 11 }} numberOfLines={1}>
          {placeLabel ? placeLabel : 'Lagos, Nigeria'}
        </Text>
        <Ionicons name="chevron-down" size={11} color={theme.color.text.secondary} />
      </Pressable>

      {/* Right Actions: Instant Profile Mode Switcher, Support & Notifications */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        {corporateJoined ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Active profile: ${mode}. Tap to switch.`}
            onPress={() => void setMode(isCorporate ? 'PERSONAL' : 'CORPORATE')}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 4,
              backgroundColor: isCorporate ? theme.color.bg['brand-subtle'] : theme.color.bg.subtle,
              borderWidth: 1,
              borderColor: isCorporate ? theme.color.border.brand : 'transparent',
              paddingVertical: 5,
              paddingHorizontal: 8,
              borderRadius: theme.radius.pill,
            }}
          >
            <Ionicons
              name={isCorporate ? 'business' : 'person'}
              size={12}
              color={isCorporate ? theme.color.text.brand : theme.color.text.secondary}
            />
            <Text
              variant="label.sm"
              style={{
                fontSize: 11,
                fontWeight: '700',
                color: isCorporate ? theme.color.text.brand : theme.color.text.secondary,
              }}
            >
              {isCorporate ? 'Corporate' : 'Personal'}
            </Text>
          </Pressable>
        ) : null}

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Help & Support"
          onPress={onPressSupport}
          style={{
            width: 36,
            height: 36,
            borderRadius: 18,
            backgroundColor: theme.color.bg.subtle,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Ionicons name="headset-outline" size={18} color={theme.color.text.secondary} />
        </Pressable>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Notifications"
          onPress={onPressNotifications}
          style={{
            width: 36,
            height: 36,
            borderRadius: 18,
            backgroundColor: theme.color.bg.subtle,
            alignItems: 'center',
            justifyContent: 'center',
            position: 'relative',
          }}
        >
          <Ionicons name="notifications-outline" size={18} color={theme.color.text.secondary} />
          <View
            style={{
              position: 'absolute',
              top: 6,
              right: 6,
              width: 8,
              height: 8,
              borderRadius: 4,
              backgroundColor: theme.color.status.danger.fg,
            }}
          />
        </Pressable>
      </View>
    </View>
  );
}
