import { Ionicons } from '@expo/vector-icons';
import { Button, Input, Text, useTheme } from '@parkly/ui-native';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Linking, Pressable, View } from 'react-native';
import { Screen } from '../../src/components/Screen';
import { useProfileMode } from '../../src/context/ProfileModeContext';

const PERKS = [
  {
    icon: 'card-outline' as const,
    title: 'Centralized Monthly Invoicing',
    desc: 'Consolidated corporate billing with official tax receipts and zero out-of-pocket expense claims for staff.',
  },
  {
    icon: 'shield-checkmark-outline' as const,
    title: 'Employer-Subsidized Parking',
    desc: 'Allocate 100% or partial parking subsidies to employee vehicles for daily commute or client meetings.',
  },
  {
    icon: 'car-sport-outline' as const,
    title: 'Reserved Executive Bays',
    desc: 'Guaranteed parking spots in prime commercial districts: Victoria Island, Ikoyi, Marina, and Ikeja GRA.',
  },
  {
    icon: 'analytics-outline' as const,
    title: 'Real-Time Fleet Dashboard',
    desc: 'Track parking utilization, barrier check-ins, and department expenses via the Parkly Corporate Portal.',
  },
];

/** Dedicated Corporate Onboarding & Fleet Management Screen. */
export default function CorporateScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { isCorporate, corporateJoined, corporateCompany, setMode, joinCorporate } =
    useProfileMode();
  const [joinCode, setJoinCode] = useState('');
  const [joinSuccess, setJoinSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleJoin = async () => {
    if (!joinCode.trim()) return;
    setLoading(true);
    await joinCorporate(joinCode);
    setLoading(false);
    setJoinSuccess(true);
  };

  return (
    <Screen showNav={false}>
      {/* Header Bar */}
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
            Corporate Parking
          </Text>
          <Text variant="body.sm" tone="secondary">
            Fleet billing & employee parking solutions
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
          Parkly for Business
        </Text>
        <Text variant="body.sm" tone="secondary" style={{ lineHeight: 18 }}>
          Empower your team with seamless barrier access and eliminate parking expense reports
          across all official Lagos car parks.
        </Text>
      </View>

      {/* Employee Join Card */}
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
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Ionicons name="key-outline" size={20} color={theme.color.text.brand} />
          <Text variant="label.md" style={{ fontWeight: '700' }}>
            Join with Company Code
          </Text>
        </View>
        <Text variant="body.sm" tone="secondary" style={{ fontSize: 12 }}>
          If your company has registered for Parkly Corporate, enter your 6-digit Join Code provided
          by your fleet manager.
        </Text>

        {corporateJoined || joinSuccess ? (
          <View style={{ gap: 10 }}>
            <View
              style={{
                backgroundColor: theme.color.bg['brand-subtle'],
                borderWidth: 1,
                borderColor: theme.color.border.brand,
                borderRadius: 12,
                padding: 14,
                gap: 6,
              }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Ionicons name="checkmark-circle" size={20} color={theme.color.text.brand} />
                <Text variant="label.sm" tone="brand" style={{ fontWeight: '700' }}>
                  {corporateCompany || 'Connected to Corporate Fleet Account!'}
                </Text>
              </View>
              <Text variant="body.sm" tone="secondary" style={{ fontSize: 12 }}>
                Current Active Mode: {isCorporate ? 'Corporate Fleet Mode' : 'Personal Mode'}
              </Text>
            </View>
            <Button
              label={isCorporate ? 'Switch to Personal Mode' : 'Switch to Corporate Mode Now'}
              variant={isCorporate ? 'secondary' : 'primary'}
              fullWidth
              onPress={() => void setMode(isCorporate ? 'PERSONAL' : 'CORPORATE')}
            />
          </View>
        ) : (
          <View style={{ gap: 10 }}>
            <Input
              label="Company Join Code"
              placeholder="e.g. CORP-9214"
              value={joinCode}
              onChangeText={setJoinCode}
              autoCapitalize="characters"
              autoCorrect={false}
            />
            <Button
              label={loading ? 'Linking account…' : 'Link Corporate Account'}
              size="md"
              fullWidth
              onPress={handleJoin}
              disabled={loading || !joinCode.trim()}
            />
          </View>
        )}
      </View>

      {/* Corporate Plan Benefits */}
      <View style={{ gap: 10 }}>
        <Text variant="label.sm" tone="secondary" style={{ fontWeight: '700' }}>
          Corporate Plan Advantages
        </Text>

        <View style={{ gap: 10 }}>
          {PERKS.map((p) => (
            <View
              key={p.title}
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
                <Ionicons name={p.icon} size={20} color={theme.color.text.brand} />
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <Text variant="label.md" style={{ fontWeight: '700' }}>
                  {p.title}
                </Text>
                <Text variant="body.sm" tone="secondary" style={{ fontSize: 12, lineHeight: 17 }}>
                  {p.desc}
                </Text>
              </View>
            </View>
          ))}
        </View>
      </View>

      {/* Onboard Company CTA */}
      <View style={{ gap: 10, paddingVertical: 4 }}>
        <Button
          label="Onboard Company (WhatsApp)"
          size="lg"
          fullWidth
          onPress={() =>
            void Linking.openURL(
              'https://wa.me/2348061325196?text=Hello%20Parkly%2C%20I%20want%20to%20onboard%20my%20company%20onto%20the%20Corporate%20Plan.',
            )
          }
        />

        <Button
          label="Open Corporate Web Portal"
          variant="secondary"
          size="lg"
          fullWidth
          onPress={() =>
            void Linking.openURL('https://parkly-web-two.vercel.app/corporate/onboarding')
          }
        />

        <Button
          label="Call Corporate Sales: 0800-PARKLY"
          variant="ghost"
          size="sm"
          fullWidth
          onPress={() => void Linking.openURL('tel:+234800727559')}
        />
      </View>
    </Screen>
  );
}
