import { Text, useTheme } from '@parkly/ui-native';
import { usePathname, useRouter } from 'expo-router';
import { Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export type TabKey = 'search' | 'bookings' | 'account';

export function BottomNav() {
  const theme = useTheme();
  const router = useRouter();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();

  const activeTab: TabKey = pathname.startsWith('/bookings')
    ? 'bookings'
    : pathname.startsWith('/account')
      ? 'account'
      : 'search';

  const tabs: Array<{
    key: TabKey;
    label: string;
    icon: string;
    route: '/home' | '/bookings' | '/account';
  }> = [
    { key: 'search', label: 'Search', icon: '🔍', route: '/home' },
    { key: 'bookings', label: 'My Bookings', icon: '🎟️', route: '/bookings' },
    { key: 'account', label: 'Account', icon: '👤', route: '/account' },
  ];

  return (
    <View
      style={{
        flexDirection: 'row',
        backgroundColor: theme.color.bg.surface,
        borderTopWidth: 1,
        borderTopColor: theme.color.border.default,
        paddingBottom: Math.max(insets.bottom, 8),
        paddingTop: 8,
        paddingHorizontal: theme.space.layout.gutter,
        alignItems: 'center',
        justifyContent: 'space-around',
      }}
    >
      {tabs.map((tab) => {
        const isActive = activeTab === tab.key;
        return (
          <Pressable
            key={tab.key}
            accessibilityRole="tab"
            accessibilityState={{ selected: isActive }}
            accessibilityLabel={tab.label}
            onPress={() => {
              if (!isActive) {
                router.replace(tab.route);
              }
            }}
            hitSlop={8}
            style={({ pressed }) => ({
              flex: 1,
              alignItems: 'center',
              justifyContent: 'center',
              paddingVertical: 6,
              borderRadius: theme.radius.md,
              opacity: pressed ? 0.7 : 1,
              backgroundColor: isActive ? theme.color.bg['brand-subtle'] : 'transparent',
            })}
          >
            <View style={{ alignItems: 'center', gap: 2 }}>
              <Text
                style={{
                  fontSize: 18,
                  marginBottom: 1,
                }}
              >
                {tab.icon}
              </Text>
              <Text
                variant="label.sm"
                style={{
                  color: isActive ? theme.color.text.brand : theme.color.text.secondary,
                  fontWeight: isActive ? '700' : '500',
                }}
              >
                {tab.label}
              </Text>
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}
