import { Ionicons } from '@expo/vector-icons';
import { Text, useTheme } from '@parkly/ui-native';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { Screen } from '../../src/components/Screen';

interface NotificationItem {
  id: string;
  title: string;
  body: string;
  time: string;
  dateGroup: string;
  icon: keyof typeof Ionicons.glyphMap;
  read: boolean;
}

const INITIAL_NOTIFICATIONS: NotificationItem[] = [
  {
    id: '1',
    title: 'LASPA Verified Guarantee 🛡️',
    body: 'All car parks on Parkly feature verified Lagos State parking tariffs with zero price spikes.',
    time: 'Just now',
    dateGroup: 'Today',
    icon: 'shield-checkmark',
    read: false,
  },
  {
    id: '2',
    title: 'Instant Gate Pass & Barrier Access 🎟️',
    body: 'Show your gate pass QR code or let the attendant scan your ticket for seamless entry.',
    time: '2 hours ago',
    dateGroup: 'Today',
    icon: 'qr-code-outline',
    read: false,
  },
  {
    id: '3',
    title: 'Stay Timer & Overstay Alerts ⏱️',
    body: 'Always settle overstay before exit to ensure prompt barrier clearance.',
    time: 'Yesterday, 4:15 PM',
    dateGroup: 'Earlier this week',
    icon: 'time-outline',
    read: true,
  },
  {
    id: '4',
    title: 'Refer a Friend, Earn ₦500 🎁',
    body: 'Share your referral code PARKLY10 with friends to give them ₦500 off and earn ₦500 credit.',
    time: 'Nov 19, 12:20 PM',
    dateGroup: 'Earlier this week',
    icon: 'gift-outline',
    read: true,
  },
  {
    id: '5',
    title: 'Welcome to Parkly 🚗',
    body: 'Find, reserve and access verified car parks across Lagos with ease.',
    time: 'Nov 16, 9:00 AM',
    dateGroup: 'Earlier this week',
    icon: 'car-outline',
    read: true,
  },
];

/** Shuttlers-style Notifications screen (image copy 5.png in UIS). */
export default function NotificationsScreen() {
  const theme = useTheme();
  const router = useRouter();
  const [items, setItems] = useState<NotificationItem[]>(INITIAL_NOTIFICATIONS);

  const groups = Array.from(new Set(items.map((i) => i.dateGroup)));

  function clearAll() {
    setItems([]);
  }

  return (
    <Screen showNav={false}>
      {/* Top Header Bar */}
      <View
        style={{
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
          paddingBottom: 8,
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Go back"
            onPress={() => router.back()}
            style={{
              width: 36,
              height: 36,
              borderRadius: 18,
              backgroundColor: theme.color.bg.subtle,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Ionicons name="arrow-back" size={20} color={theme.color.text.primary} />
          </Pressable>
          <Text variant="heading.md" style={{ fontWeight: '800' }}>
            Notifications
          </Text>
        </View>

        {items.length > 0 ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Clear all notifications"
            onPress={clearAll}
            hitSlop={8}
          >
            <Text variant="label.sm" style={{ color: theme.color.text.brand, fontWeight: '700' }}>
              Clear All
            </Text>
          </Pressable>
        ) : null}
      </View>

      {/* Empty State */}
      {items.length === 0 ? (
        <View style={{ alignItems: 'center', paddingVertical: 60, gap: 12 }}>
          <View
            style={{
              width: 64,
              height: 64,
              borderRadius: 32,
              backgroundColor: theme.color.bg.subtle,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Ionicons
              name="notifications-off-outline"
              size={32}
              color={theme.color.text.secondary}
            />
          </View>
          <Text variant="heading.sm" style={{ fontWeight: '700' }}>
            No notifications
          </Text>
          <Text variant="body.sm" tone="tertiary" style={{ textAlign: 'center' }}>
            You're all caught up! Booking updates and reminders will appear here.
          </Text>
        </View>
      ) : null}

      {/* Notifications Grouped by Date */}
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: 16 }}>
        {groups.map((group) => {
          const groupItems = items.filter((i) => i.dateGroup === group);
          return (
            <View key={group} style={{ gap: 10 }}>
              <Text variant="label.sm" tone="secondary" style={{ fontWeight: '600', fontSize: 12 }}>
                {group}
              </Text>

              <View
                style={{
                  backgroundColor: theme.card.bg,
                  borderWidth: 1,
                  borderColor: theme.card.border,
                  borderRadius: 18,
                  overflow: 'hidden',
                }}
              >
                {groupItems.map((item, idx) => (
                  <View
                    key={item.id}
                    style={{
                      flexDirection: 'row',
                      gap: 12,
                      padding: 14,
                      borderTopWidth: idx > 0 ? 1 : 0,
                      borderTopColor: theme.color.border.default,
                      backgroundColor: item.read ? 'transparent' : theme.color.bg['brand-subtle'],
                    }}
                  >
                    <View
                      style={{
                        width: 40,
                        height: 40,
                        borderRadius: 20,
                        backgroundColor: theme.color.bg.subtle,
                        alignItems: 'center',
                        justifyContent: 'center',
                        marginTop: 2,
                      }}
                    >
                      <Ionicons name={item.icon} size={20} color={theme.color.text.brand} />
                    </View>

                    <View style={{ flex: 1, gap: 3 }}>
                      <Text variant="label.md" style={{ fontWeight: '700' }}>
                        {item.title}
                      </Text>
                      <Text variant="body.sm" tone="secondary" style={{ lineHeight: 18 }}>
                        {item.body}
                      </Text>
                      <Text
                        variant="body.sm"
                        tone="tertiary"
                        style={{ fontSize: 11, marginTop: 2 }}
                      >
                        {item.time}
                      </Text>
                    </View>
                  </View>
                ))}
              </View>
            </View>
          );
        })}
      </ScrollView>
    </Screen>
  );
}
