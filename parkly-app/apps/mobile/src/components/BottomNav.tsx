import { Ionicons } from '@expo/vector-icons';
import { Text, useTheme } from '@parkly/ui-native';
import { usePathname, useRouter } from 'expo-router';
import { Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export type TabKey = 'search' | 'bookings' | 'passes' | 'account';

type TabConfig = {
  key: TabKey;
  label: string;
  route: '/home' | '/bookings' | '/passes' | '/account';
  activeIcon: keyof typeof Ionicons.glyphMap;
  inactiveIcon: keyof typeof Ionicons.glyphMap;
};

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

  const tabs: TabConfig[] = [
    {
      key: 'search',
      label: 'Search',
      route: '/home',
      activeIcon: 'search',
      inactiveIcon: 'search-outline',
    },
    {
      key: 'bookings',
      label: 'Bookings',
      route: '/bookings',
      activeIcon: 'calendar',
      inactiveIcon: 'calendar-outline',
    },
    {
      key: 'passes',
      label: 'Passes',
      route: '/passes',
      activeIcon: 'card',
      inactiveIcon: 'card-outline',
    },
    {
      key: 'account',
      label: 'Account',
      route: '/account',
      activeIcon: 'person',
      inactiveIcon: 'person-outline',
    },
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
        const iconName = isActive ? tab.activeIcon : tab.inactiveIcon;
        const color = isActive ? theme.color.text.brand : theme.color.text.secondary;

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
              paddingTop: 8,
              paddingBottom: 6,
              gap: 4,
            }}
          >
            <View
              style={{
                width: 32,
                height: 28,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Ionicons name={iconName} size={22} color={color} />
            </View>
            <Text
              variant="label.sm"
              style={{
                color,
                fontWeight: isActive ? '700' : '500',
                fontSize: 11,
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
