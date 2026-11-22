import { Ionicons } from '@expo/vector-icons';
import { Text, useTheme } from '@parkly/ui-native';
import { Pressable, View } from 'react-native';

interface ProfileHeaderProps {
  name: string;
  email?: string;
  phoneLast4?: string | null;
  isVerifiedDriver?: boolean;
  onShareReferral?: () => void;
  onListSpace?: () => void;
}

/** Shuttlers-style profile header with referral & host cards (image copy 4.png). */
export function ProfileHeader({
  name,
  email,
  phoneLast4,
  isVerifiedDriver,
  onShareReferral,
  onListSpace,
}: ProfileHeaderProps) {
  const theme = useTheme();

  return (
    <View style={{ gap: 16 }}>
      {/* User Avatar & Identity */}
      <View style={{ alignItems: 'center', gap: 8, paddingVertical: 8 }}>
        <View style={{ position: 'relative' }}>
          <View
            style={{
              width: 84,
              height: 84,
              borderRadius: 42,
              backgroundColor: theme.color.bg['brand-subtle'],
              alignItems: 'center',
              justifyContent: 'center',
              borderWidth: 2,
              borderColor: theme.color.border.brand,
            }}
          >
            <Ionicons name="person" size={44} color={theme.color.text.brand} />
          </View>
          <View
            style={{
              position: 'absolute',
              bottom: 0,
              right: 0,
              width: 26,
              height: 26,
              borderRadius: 13,
              backgroundColor: theme.color.bg.surface,
              borderWidth: 1,
              borderColor: theme.color.border.default,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Ionicons name="pencil" size={13} color={theme.color.text.secondary} />
          </View>
        </View>

        <Text variant="heading.md" style={{ fontWeight: '700' }}>
          {name || 'Your Profile'}
        </Text>

        <Text variant="body.sm" tone="secondary">
          {email || (phoneLast4 ? `Phone ending ${phoneLast4}` : 'Parkly Member')}
        </Text>

        {isVerifiedDriver ? (
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 6,
              paddingVertical: 4,
              paddingHorizontal: 12,
              borderRadius: theme.radius.full,
              backgroundColor: theme.color.status.success.bg,
              borderWidth: 1,
              borderColor: theme.color.status.success.fg,
            }}
          >
            <Ionicons name="shield-checkmark" size={14} color={theme.color.status.success.fg} />
            <Text
              variant="label.sm"
              style={{
                color: theme.color.status.success.fg,
                fontWeight: '700',
                fontSize: 11,
              }}
            >
              LASPA Verified Driver (Tier 2)
            </Text>
          </View>
        ) : null}
      </View>

      {/* Refer a Friend Promo Card */}
      <View
        style={{
          borderRadius: 20,
          backgroundColor: theme.color.action.primary.bg,
          padding: 16,
          gap: 12,
        }}
      >
        <View
          style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}
        >
          <View style={{ gap: 2 }}>
            <Text variant="label.sm" style={{ color: '#E0F2FE', fontSize: 11 }}>
              Refer a friend
            </Text>
            <Text variant="heading.sm" style={{ color: '#FFFFFF', fontWeight: '800' }}>
              PARKLY10
            </Text>
          </View>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Share invite code"
            onPress={onShareReferral}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 6,
              backgroundColor: '#FFFFFF',
              paddingVertical: 8,
              paddingHorizontal: 14,
              borderRadius: theme.radius.full,
            }}
          >
            <Ionicons name="share-social-outline" size={15} color={theme.color.action.primary.bg} />
            <Text
              variant="label.sm"
              style={{
                color: theme.color.action.primary.bg,
                fontWeight: '700',
              }}
            >
              Share invite
            </Text>
          </Pressable>
        </View>
        <Text variant="body.sm" style={{ color: '#F0FDFA', fontSize: 11 }}>
          Give friends ₦500 off their first stay and get ₦500 credit when they park.
        </Text>
      </View>

      {/* Host / Space Owner Card */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Turn your parking space into earnings"
        onPress={onListSpace}
        style={({ pressed }) => ({
          flexDirection: 'row',
          alignItems: 'center',
          gap: 12,
          backgroundColor: theme.card.bg,
          borderWidth: 1,
          borderColor: pressed ? theme.color.border.brand : theme.card.border,
          borderRadius: 16,
          padding: 14,
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
          <Ionicons name="business-outline" size={22} color={theme.color.text.brand} />
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <Text variant="label.md" style={{ fontWeight: '700' }}>
            Turn your space into earnings →
          </Text>
          <Text variant="body.sm" tone="secondary" style={{ fontSize: 11 }}>
            List your parking facility on Parkly & start earning
          </Text>
        </View>
      </Pressable>
    </View>
  );
}
