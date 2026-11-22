import { Ionicons } from '@expo/vector-icons';
import { Button, Text, useTheme } from '@parkly/ui-native';
import { useRouter } from 'expo-router';
import { Linking, Pressable, View } from 'react-native';
import { Screen } from '../../src/components/Screen';

const BENEFITS = [
  {
    icon: 'cash-outline' as const,
    title: 'Guaranteed Weekly Payouts',
    desc: 'Automated revenue settlement directly into your Nigerian bank account with zero manual reconciliations.',
  },
  {
    icon: 'shield-checkmark-outline' as const,
    title: 'Verified Drivers Only',
    desc: 'Every driver must pass mandatory FRSC Driver’s License or NIMC identity verification before booking.',
  },
  {
    icon: 'phone-portrait-outline' as const,
    title: 'Live Occupancy & Gate Pass',
    desc: 'Manage your entry barriers, validate 6-character check-in passes, and monitor spaces in real time.',
  },
  {
    icon: 'business-outline' as const,
    title: 'LASPA & Legal Compliant',
    desc: 'Full regulatory compliance with official Lagos State parking tariffs and zero unauthorized roadside extortion.',
  },
];

/** Dedicated Space Host Onboarding & Parking Facility Listing Screen. */
export default function ListSpaceScreen() {
  const theme = useTheme();
  const router = useRouter();

  return (
    <Screen showNav={false}>
      {/* Top Navigation Bar */}
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
            List Your Space
          </Text>
          <Text variant="body.sm" tone="secondary">
            Earn recurring revenue from your parking bays
          </Text>
        </View>
      </View>

      {/* Hero Banner Card */}
      <View
        style={{
          backgroundColor: theme.color.bg['brand-subtle'],
          borderWidth: 1,
          borderColor: theme.color.border.brand,
          borderRadius: 20,
          padding: 18,
          gap: 10,
        }}
      >
        <View
          style={{
            width: 48,
            height: 48,
            borderRadius: 24,
            backgroundColor: theme.color.bg.surface,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Ionicons name="business" size={26} color={theme.color.text.brand} />
        </View>
        <Text variant="heading.sm" style={{ fontWeight: '800' }}>
          Monetize Your Parking Facility
        </Text>
        <Text variant="body.sm" tone="secondary" style={{ lineHeight: 18 }}>
          Whether you operate a commercial car park in Victoria Island, an office compound in Ikeja,
          or an event space in Lekki, Parkly connects you to thousands of verified drivers.
        </Text>
      </View>

      {/* 4 Pillars of Space Hosting */}
      <View style={{ gap: 12 }}>
        <Text variant="label.sm" tone="secondary" style={{ fontWeight: '700' }}>
          Why Host with Parkly?
        </Text>

        <View style={{ gap: 10 }}>
          {BENEFITS.map((b) => (
            <View
              key={b.title}
              style={{
                flexDirection: 'row',
                gap: 14,
                padding: 14,
                borderRadius: 16,
                backgroundColor: theme.card.bg,
                borderWidth: 1,
                borderColor: theme.card.border,
              }}
            >
              <View
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: 20,
                  backgroundColor: theme.color.bg['brand-subtle'],
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginTop: 2,
                }}
              >
                <Ionicons name={b.icon} size={20} color={theme.color.text.brand} />
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <Text variant="label.md" style={{ fontWeight: '700' }}>
                  {b.title}
                </Text>
                <Text variant="body.sm" tone="secondary" style={{ fontSize: 12, lineHeight: 17 }}>
                  {b.desc}
                </Text>
              </View>
            </View>
          ))}
        </View>
      </View>

      {/* How it Works: 3 Steps */}
      <View
        style={{
          backgroundColor: theme.card.bg,
          borderWidth: 1,
          borderColor: theme.card.border,
          borderRadius: 18,
          padding: 16,
          gap: 12,
        }}
      >
        <Text variant="label.md" style={{ fontWeight: '700' }}>
          3 Simple Steps to Start Earning
        </Text>

        <View style={{ gap: 10 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <View
              style={{
                width: 24,
                height: 24,
                borderRadius: 12,
                backgroundColor: theme.color.text.brand,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Text style={{ color: '#FFFFFF', fontSize: 12, fontWeight: '700' }}>1</Text>
            </View>
            <Text variant="body.sm" style={{ flex: 1 }}>
              Submit your car park address and bay count.
            </Text>
          </View>

          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <View
              style={{
                width: 24,
                height: 24,
                borderRadius: 12,
                backgroundColor: theme.color.text.brand,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Text style={{ color: '#FFFFFF', fontSize: 12, fontWeight: '700' }}>2</Text>
            </View>
            <Text variant="body.sm" style={{ flex: 1 }}>
              Parkly team inspects and sets up your barrier gate QR poster.
            </Text>
          </View>

          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <View
              style={{
                width: 24,
                height: 24,
                borderRadius: 12,
                backgroundColor: theme.color.text.brand,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Text style={{ color: '#FFFFFF', fontSize: 12, fontWeight: '700' }}>3</Text>
            </View>
            <Text variant="body.sm" style={{ flex: 1 }}>
              Receive bookings and weekly automated payouts.
            </Text>
          </View>
        </View>
      </View>

      {/* Contact & Registration Actions */}
      <View style={{ gap: 10, paddingVertical: 4 }}>
        <Button
          label="Chat with Host Team (WhatsApp)"
          size="lg"
          fullWidth
          onPress={() =>
            void Linking.openURL(
              'https://wa.me/2348123456789?text=Hello%20Parkly%2C%20I%20am%20interested%20in%20listing%20my%20parking%20space.',
            )
          }
        />

        <Button
          label="Open Operator Portal (Web)"
          variant="secondary"
          size="lg"
          fullWidth
          onPress={() => void Linking.openURL('https://parkly-web-two.vercel.app/sign-up')}
        />

        <Button
          label="Call Partner Desk: 0800-PARKLY"
          variant="ghost"
          size="sm"
          fullWidth
          onPress={() => void Linking.openURL('tel:+234800727559')}
        />
      </View>
    </Screen>
  );
}
