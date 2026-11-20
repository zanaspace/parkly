import { Text, useTheme } from '@parkly/ui-native';
import { usePathname, useRouter } from 'expo-router';
import { Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export type TabKey = 'search' | 'bookings' | 'passes' | 'account';

export function BottomNav() {
  const theme = useTheme();
  const router = useRouter();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();

  const activeTab: TabKey = pathname.startsWith('/bookings')
    ? 'bookings'
    : pathname.startsWith('/passes') || pathname.startsWith('/pass/')
      ? 'passes'
      : pathname.startsWith('/account')
        ? 'account'
        : 'search';

  const tabs: Array<{
    key: TabKey;
    label: string;
    route: '/home' | '/bookings' | '/passes' | '/account';
  }> = [
    { key: 'search', label: 'Search', route: '/home' },
    { key: 'bookings', label: 'Bookings', route: '/bookings' },
    { key: 'passes', label: 'Passes', route: '/passes' },
    { key: 'account', label: 'Account', route: '/account' },
  ];

  return (
    <View
      style={{
        flexDirection: 'row',
        backgroundColor: theme.color.bg.surface,
        borderTopWidth: 1,
        borderTopColor: theme.color.border.default,
        paddingBottom: Math.max(insets.bottom, 8),
        paddingHorizontal: theme.space.layout.gutter,
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
            style={{
              flex: 1,
              alignItems: 'center',
              justifyContent: 'center',
              paddingTop: 10,
              paddingBottom: 8,
            }}
          >
            <View
              style={{
                height: 3,
                width: 20,
                borderRadius: theme.radius.full,
                backgroundColor: isActive ? theme.color.bg.brand : 'transparent',
                marginBottom: 6,
              }}
            />
            <Text
              variant="label.sm"
              style={{
                color: isActive ? theme.color.text.brand : theme.color.text.secondary,
                fontWeight: isActive ? '700' : '500',
              }}
            >
              {tab.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
