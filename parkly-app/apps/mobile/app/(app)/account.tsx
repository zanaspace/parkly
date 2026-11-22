import { Ionicons } from '@expo/vector-icons';
import { Button, Text, useTheme } from '@parkly/ui-native';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Linking, Pressable, View } from 'react-native';
import { useAuth } from '../../src/auth/AuthProvider';
import { DriverVerificationCard } from '../../src/components/DriverVerificationCard';
import { ListItem, ListItemGroup } from '../../src/components/ListItem';
import { Notice } from '../../src/components/Notice';
import { ProfileHeader } from '../../src/components/ProfileHeader';
import { Screen } from '../../src/components/Screen';
import { VehicleRow } from '../../src/components/VehicleRow';
import { ApiError } from '../../src/lib/api';
import { api } from '../../src/lib/client';
import { confirm } from '../../src/lib/confirm';
import { legalUrl } from '../../src/lib/legal-links';

const MAX_VEHICLES = 5;

function errorText(err: unknown) {
  return err instanceof ApiError ? err.message : 'Something went wrong. Please try again.';
}

/** D-26 Account settings: profile, vehicles, corporate mode, data export, sign-out, deletion request. */
export default function Account() {
  const theme = useTheme();
  const router = useRouter();
  const auth = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [accountMode, setAccountMode] = useState<'PERSONAL' | 'CORPORATE'>('PERSONAL');
  const [busy, setBusy] = useState<'device' | 'all' | 'delete' | 'export' | 'keep' | null>(null);
  const { me, vehicles } = auth;

  async function signOut(scope: 'device' | 'all') {
    if (scope === 'all') {
      const ok = await confirm(
        'Sign out everywhere?',
        'You’ll be signed out on every phone and browser.',
        'Sign out all',
      );
      if (!ok) return;
    }
    setBusy(scope);
    await auth.signOut(scope);
  }

  async function requestDeletion() {
    const ok = await confirm(
      'Delete your account?',
      'We’ll deactivate your account now and erase your personal details within 30 days. Payment and booking records are kept as the law requires.',
      'Delete account',
      true,
    );
    if (!ok) return;
    setBusy('delete');
    setError(null);
    try {
      await api.requestDeletion();
      await auth.signOut('all');
    } catch (err) {
      setError(errorText(err));
      setBusy(null);
    }
  }

  function downloadMyData() {
    router.push('/data-export' as never);
  }

  async function keepAccount() {
    setBusy('keep');
    setError(null);
    try {
      await api.cancelDeletion();
      if (me) auth.setMe({ ...me, status: 'ACTIVE' });
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(null);
    }
  }

  return (
    <Screen showNav>
      {router.canGoBack() ? (
        <Button
          label="Back"
          variant="ghost"
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/home'))}
        />
      ) : null}
      <ProfileHeader
        name={[me?.firstName, me?.lastName].filter(Boolean).join(' ') || 'Parkly Driver'}
        phoneLast4={me?.phoneLast4}
        isVerifiedDriver={me?.isVerifiedDriver}
        onShareReferral={() => {
          void Linking.openURL('https://parkly.ng/invite/PARKLY10');
        }}
        onListSpace={() => {
          router.push('/list-space' as never);
        }}
      />

      {/* Mode Switcher: Personal ⇄ Corporate */}
      <View
        style={{
          flexDirection: 'row',
          backgroundColor: theme.color.bg.subtle,
          borderRadius: theme.radius.pill,
          padding: 4,
          gap: 4,
        }}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Personal Parking Mode"
          onPress={() => setAccountMode('PERSONAL')}
          style={{
            flex: 1,
            paddingVertical: 8,
            alignItems: 'center',
            borderRadius: theme.radius.pill,
            backgroundColor: accountMode === 'PERSONAL' ? theme.color.bg.surface : 'transparent',
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Ionicons
              name="person"
              size={14}
              color={
                accountMode === 'PERSONAL' ? theme.color.text.brand : theme.color.text.secondary
              }
            />
            <Text
              variant="label.sm"
              style={{
                color:
                  accountMode === 'PERSONAL' ? theme.color.text.brand : theme.color.text.secondary,
                fontWeight: accountMode === 'PERSONAL' ? '700' : '500',
              }}
            >
              Personal
            </Text>
          </View>
        </Pressable>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Corporate Parking Mode"
          onPress={() => setAccountMode('CORPORATE')}
          style={{
            flex: 1,
            paddingVertical: 8,
            alignItems: 'center',
            borderRadius: theme.radius.pill,
            backgroundColor: accountMode === 'CORPORATE' ? theme.color.bg.surface : 'transparent',
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Ionicons
              name="business"
              size={14}
              color={
                accountMode === 'CORPORATE' ? theme.color.text.brand : theme.color.text.secondary
              }
            />
            <Text
              variant="label.sm"
              style={{
                color:
                  accountMode === 'CORPORATE' ? theme.color.text.brand : theme.color.text.secondary,
                fontWeight: accountMode === 'CORPORATE' ? '700' : '500',
              }}
            >
              Corporate Fleet
            </Text>
          </View>
        </Pressable>
      </View>

      {/* Corporate Active Banner when in Corporate Mode */}
      {accountMode === 'CORPORATE' ? (
        <View
          style={{
            backgroundColor: theme.color.bg['brand-subtle'],
            borderWidth: 1,
            borderColor: theme.color.border.brand,
            borderRadius: 16,
            padding: 14,
            gap: 6,
          }}
        >
          <View
            style={{
              flexDirection: 'row',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Ionicons name="business" size={18} color={theme.color.text.brand} />
              <Text variant="label.sm" tone="brand" style={{ fontWeight: '700' }}>
                Corporate Fleet Active
              </Text>
            </View>
            <Text
              variant="label.sm"
              style={{ color: theme.color.status.success.fg, fontWeight: '700' }}
            >
              Subsidized
            </Text>
          </View>
          <Text variant="body.sm" tone="secondary" style={{ fontSize: 12, lineHeight: 17 }}>
            Reservations are linked to corporate billing. Centralized invoices are issued to your
            company monthly.
          </Text>
        </View>
      ) : null}

      {/* Driver Verification Form */}
      <DriverVerificationCard />

      <Text variant="heading.sm">Vehicles</Text>
      {error && me?.isVerifiedDriver ? <Notice message={error} /> : null}
      {vehicles && vehicles.length > 0 ? (
        vehicles.map((v) => (
          <VehicleRow key={v.id} vehicle={v} onChanged={auth.refreshVehicles} onError={setError} />
        ))
      ) : (
        <Text tone="secondary">No vehicles yet.</Text>
      )}
      {(vehicles?.length ?? 0) < MAX_VEHICLES ? (
        <Button
          label="Add vehicle"
          variant="secondary"
          onPress={() => router.push('/add-vehicle')}
        />
      ) : null}

      <Text variant="heading.sm">Settings</Text>
      <ListItemGroup>
        <ListItem
          icon={<Ionicons name="headset-outline" size={18} color={theme.color.text.brand} />}
          label="Help & Support"
          description="24/7 hotline, live chat & FAQs"
          onPress={() => router.push('/support' as never)}
        />
        <ListItem
          icon={<Ionicons name="business-outline" size={18} color={theme.color.text.brand} />}
          label="Corporate Parking Plan"
          description="Employer parking subsidies & fleet billing."
          onPress={() => router.push('/corporate' as never)}
        />
        <ListItem
          icon={<Ionicons name="download-outline" size={18} color={theme.color.text.brand} />}
          label="Download my data"
          description="A copy of the personal data Parkly holds about you."
          loading={busy === 'export'}
          onPress={() => void downloadMyData()}
        />
        <ListItem
          icon={
            <Ionicons name="document-text-outline" size={18} color={theme.color.text.secondary} />
          }
          label="Terms of Service"
          onPress={() => void Linking.openURL(legalUrl('terms'))}
        />
        <ListItem
          icon={
            <Ionicons
              name="shield-checkmark-outline"
              size={18}
              color={theme.color.text.secondary}
            />
          }
          label="Privacy Notice"
          onPress={() => void Linking.openURL(legalUrl('privacy'))}
        />
        <ListItem
          icon={<Ionicons name="log-out-outline" size={18} color={theme.color.text.secondary} />}
          label="Sign out of this phone"
          loading={busy === 'device'}
          onPress={() => void signOut('device')}
        />
        <ListItem
          icon={
            <Ionicons name="phone-portrait-outline" size={18} color={theme.color.text.secondary} />
          }
          label="Sign out everywhere"
          loading={busy === 'all'}
          onPress={() => void signOut('all')}
        />
        {me?.status === 'PENDING_DELETION' ? (
          <ListItem
            icon={<Ionicons name="refresh-outline" size={18} color={theme.color.text.brand} />}
            label="Keep my account"
            description="Your account is set to be erased. You can change your mind within 30 days."
            loading={busy === 'keep'}
            showChevron={false}
            onPress={() => void keepAccount()}
          />
        ) : (
          <ListItem
            icon={<Ionicons name="trash-outline" size={18} color={theme.color.status.danger.fg} />}
            label="Delete my account"
            description="Your details are erased after 30 days."
            tone="danger"
            loading={busy === 'delete'}
            showChevron={false}
            onPress={() => void requestDeletion()}
          />
        )}
      </ListItemGroup>
    </Screen>
  );
}
