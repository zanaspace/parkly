import { Ionicons } from '@expo/vector-icons';
import { Text, useTheme } from '@parkly/ui-native';
import { useRouter } from 'expo-router';
import { Pressable, View } from 'react-native';

interface ServiceItem {
  key: string;
  title: string;
  subtitle: string;
  icon: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
  badge?: string;
}

/** 6-tile sleek service grid inspired by Shuttlers UI (image.png). */
export function ServiceGrid({ onScanPress }: { onScanPress?: () => void }) {
  const theme = useTheme();
  const router = useRouter();

  const services: ServiceItem[] = [
    {
      key: 'book',
      title: 'Book',
      subtitle: 'Reserve bays',
      icon: 'car-outline',
      onPress: () => router.push('/search'),
    },
    {
      key: 'passes',
      title: 'Passes',
      subtitle: '30-day regular',
      icon: 'card-outline',
      badge: 'Popular',
      onPress: () => router.push('/passes'),
    },
    {
      key: 'scan',
      title: 'Scan Gate',
      subtitle: 'Barrier check-in',
      icon: 'qr-code-outline',
      onPress: onScanPress ?? (() => router.push('/bookings')),
    },
    {
      key: 'timer',
      title: 'Live Timer',
      subtitle: 'Track your stay',
      icon: 'time-outline',
      onPress: () => router.push('/bookings'),
    },
    {
      key: 'laspa',
      title: 'LASPA',
      subtitle: 'Verified rates',
      icon: 'shield-checkmark-outline',
      onPress: () => router.push('/search'),
    },
    {
      key: 'rewards',
      title: 'Rewards',
      subtitle: 'Claim points',
      icon: 'gift-outline',
      onPress: () => router.push('/account'),
    },
  ];

  return (
    <View style={{ gap: 10 }}>
      <View
        style={{
          flexDirection: 'row',
          flexWrap: 'wrap',
          gap: 10,
        }}
      >
        {services.map((item) => (
          <Pressable
            key={item.key}
            accessibilityRole="button"
            accessibilityLabel={`${item.title}, ${item.subtitle}`}
            onPress={item.onPress}
            style={({ pressed }) => ({
              width: '31%',
              flexGrow: 1,
              backgroundColor: theme.card.bg,
              borderColor: pressed ? theme.color.border.brand : theme.card.border,
              borderWidth: 1,
              borderRadius: 16,
              paddingVertical: 14,
              paddingHorizontal: 10,
              alignItems: 'center',
              justifyContent: 'center',
              position: 'relative',
              gap: 4,
            })}
          >
            {item.badge ? (
              <View
                style={{
                  position: 'absolute',
                  top: 6,
                  right: 6,
                  backgroundColor: theme.color.bg['brand-subtle'],
                  paddingVertical: 2,
                  paddingHorizontal: 6,
                  borderRadius: theme.radius.full,
                }}
              >
                <Text
                  variant="label.sm"
                  style={{
                    color: theme.color.text.brand,
                    fontSize: 9,
                    fontWeight: '700',
                  }}
                >
                  {item.badge}
                </Text>
              </View>
            ) : null}

            <View
              style={{
                width: 44,
                height: 44,
                borderRadius: 22,
                backgroundColor: theme.color.bg['brand-subtle'],
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: 2,
              }}
            >
              <Ionicons name={item.icon} size={22} color={theme.color.text.brand} />
            </View>

            <Text
              variant="label.md"
              style={{
                fontWeight: '700',
                color: theme.color.text.primary,
                textAlign: 'center',
              }}
            >
              {item.title}
            </Text>
            <Text
              variant="body.sm"
              tone="tertiary"
              style={{
                fontSize: 10,
                textAlign: 'center',
              }}
            >
              {item.subtitle}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}
