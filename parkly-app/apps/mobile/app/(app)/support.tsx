import { Ionicons } from '@expo/vector-icons';
import { Button, Text, useTheme } from '@parkly/ui-native';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Linking, Pressable, View } from 'react-native';
import { Screen } from '../../src/components/Screen';

const FAQS = [
  {
    q: 'How do I pay overstay if card payment fails?',
    a: 'On the Paystack checkout screen, you can select "Pay with Bank Transfer" to make an instant transfer, or contact our 24/7 support desk to verify payment and clear your barrier.',
  },
  {
    q: 'What if the car park gate cannot scan my QR code?',
    a: 'Tap "Offline Ticket" in your booking screen. Show the 6-character booking code or offline pass to the parking attendant for immediate manual entry/exit.',
  },
  {
    q: 'Are all car park rates official?',
    a: 'Yes. Every car park on Parkly is verified against official Lagos State Parking Authority (LASPA) tariffs. Attendants are prohibited from charging roadside surcharges.',
  },
  {
    q: 'Can I cancel a booking and get a refund?',
    a: 'Yes. You can cancel any hourly booking up to 30 minutes before your scheduled arrival time for a 100% full refund directly to your original payment method.',
  },
  {
    q: 'How do monthly passes work?',
    a: '30-day monthly passes provide unlimited access to your designated car park. You can swap your registered vehicle plate up to 2 times per 30-day billing cycle.',
  },
];

/** Dedicated 24/7 Driver Support & Emergency Help Screen. */
export default function SupportScreen() {
  const theme = useTheme();
  const router = useRouter();
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  const toggleFaq = (idx: number) => {
    setOpenFaq((cur) => (cur === idx ? null : idx));
  };

  return (
    <Screen showNav={false}>
      {/* Top Header Bar */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 12,
          paddingBottom: 4,
        }}
      >
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
        <View style={{ flex: 1 }}>
          <Text variant="heading.md" style={{ fontWeight: '800' }}>
            Help & Support
          </Text>
          <Text variant="body.sm" tone="secondary">
            24/7 driver assistance across Lagos
          </Text>
        </View>
      </View>

      {/* Network Status Badge */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 8,
          backgroundColor: theme.color.bg['brand-subtle'],
          borderWidth: 1,
          borderColor: theme.color.border.brand,
          borderRadius: theme.radius.pill,
          paddingVertical: 8,
          paddingHorizontal: 14,
          alignSelf: 'flex-start',
        }}
      >
        <View
          style={{
            width: 8,
            height: 8,
            borderRadius: 4,
            backgroundColor: theme.color.status.success.fg,
          }}
        />
        <Text variant="label.sm" tone="brand" style={{ fontWeight: '700' }}>
          Lagos Operations: Active 24/7
        </Text>
      </View>

      {/* Quick Contact Action Cards */}
      <View style={{ gap: 10 }}>
        <Text variant="label.sm" tone="secondary" style={{ fontWeight: '700' }}>
          Direct Support Channels
        </Text>

        {/* WhatsApp Live Chat */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Chat on WhatsApp with Parkly Support"
          onPress={() =>
            void Linking.openURL(
              'https://wa.me/2348123456789?text=Hello%20Parkly%20Support%2C%20I%20need%20assistance.',
            )
          }
          style={({ pressed }) => ({
            flexDirection: 'row',
            alignItems: 'center',
            gap: 14,
            padding: 14,
            borderRadius: 16,
            backgroundColor: theme.card.bg,
            borderWidth: 1,
            borderColor: pressed ? theme.color.border.brand : theme.card.border,
          })}
        >
          <View
            style={{
              width: 44,
              height: 44,
              borderRadius: 22,
              backgroundColor: '#E8F5E9',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Ionicons name="logo-whatsapp" size={24} color="#2E7D32" />
          </View>
          <View style={{ flex: 1, gap: 2 }}>
            <Text variant="label.md" style={{ fontWeight: '700' }}>
              WhatsApp Live Chat
            </Text>
            <Text variant="body.sm" tone="secondary" style={{ fontSize: 12 }}>
              Fastest response · Average reply under 3 mins
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={theme.color.text.secondary} />
        </Pressable>

        {/* Phone Call Hotline */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Call Parkly emergency helpline"
          onPress={() => void Linking.openURL('tel:+234800727559')}
          style={({ pressed }) => ({
            flexDirection: 'row',
            alignItems: 'center',
            gap: 14,
            padding: 14,
            borderRadius: 16,
            backgroundColor: theme.card.bg,
            borderWidth: 1,
            borderColor: pressed ? theme.color.border.brand : theme.card.border,
          })}
        >
          <View
            style={{
              width: 44,
              height: 44,
              borderRadius: 22,
              backgroundColor: theme.color.bg['brand-subtle'],
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Ionicons name="call-outline" size={22} color={theme.color.text.brand} />
          </View>
          <View style={{ flex: 1, gap: 2 }}>
            <Text variant="label.md" style={{ fontWeight: '700' }}>
              24/7 Emergency Helpline
            </Text>
            <Text variant="body.sm" tone="secondary" style={{ fontSize: 12 }}>
              Toll-free voice assistance for gate & barrier issues
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={theme.color.text.secondary} />
        </Pressable>

        {/* Email Support */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Email Parkly Support"
          onPress={() => void Linking.openURL('mailto:support@parkly.ng?subject=Driver%20Support')}
          style={({ pressed }) => ({
            flexDirection: 'row',
            alignItems: 'center',
            gap: 14,
            padding: 14,
            borderRadius: 16,
            backgroundColor: theme.card.bg,
            borderWidth: 1,
            borderColor: pressed ? theme.color.border.brand : theme.card.border,
          })}
        >
          <View
            style={{
              width: 44,
              height: 44,
              borderRadius: 22,
              backgroundColor: theme.color.bg.subtle,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Ionicons name="mail-outline" size={22} color={theme.color.text.primary} />
          </View>
          <View style={{ flex: 1, gap: 2 }}>
            <Text variant="label.md" style={{ fontWeight: '700' }}>
              Email Support
            </Text>
            <Text variant="body.sm" tone="secondary" style={{ fontSize: 12 }}>
              support@parkly.ng · For receipts & billing queries
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={theme.color.text.secondary} />
        </Pressable>
      </View>

      {/* Frequently Asked Questions */}
      <View style={{ gap: 10 }}>
        <Text variant="label.sm" tone="secondary" style={{ fontWeight: '700' }}>
          Frequently Asked Questions
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
          {FAQS.map((item, idx) => {
            const isOpen = openFaq === idx;
            return (
              <View
                key={item.q}
                style={{
                  borderTopWidth: idx > 0 ? 1 : 0,
                  borderTopColor: theme.color.border.default,
                }}
              >
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={item.q}
                  onPress={() => toggleFaq(idx)}
                  style={{
                    flexDirection: 'row',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: 14,
                    gap: 10,
                  }}
                >
                  <Text variant="label.md" style={{ flex: 1, fontWeight: '600' }}>
                    {item.q}
                  </Text>
                  <Ionicons
                    name={isOpen ? 'chevron-up' : 'chevron-down'}
                    size={18}
                    color={theme.color.text.secondary}
                  />
                </Pressable>
                {isOpen ? (
                  <View
                    style={{
                      paddingHorizontal: 14,
                      paddingBottom: 14,
                      paddingTop: 2,
                    }}
                  >
                    <Text variant="body.sm" tone="secondary" style={{ lineHeight: 18 }}>
                      {item.a}
                    </Text>
                  </View>
                ) : null}
              </View>
            );
          })}
        </View>
      </View>

      {/* Space Host Link */}
      <View
        style={{
          backgroundColor: theme.color.bg.subtle,
          borderRadius: 16,
          padding: 16,
          gap: 8,
          alignItems: 'center',
        }}
      >
        <Text variant="label.md" style={{ fontWeight: '700' }}>
          Own a car park or parking bay?
        </Text>
        <Text variant="body.sm" tone="secondary" style={{ textAlign: 'center', fontSize: 12 }}>
          List your facility on Parkly to start earning guaranteed parking revenue.
        </Text>
        <Button
          label="Become a Space Host"
          variant="secondary"
          size="sm"
          onPress={() => router.push('/list-space' as never)}
        />
      </View>
    </Screen>
  );
}
