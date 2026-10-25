import type { Booking } from '@parkly/contracts';
import { bookingWindowLabel } from '@parkly/domain/booking';
import { lineLabel } from '@parkly/domain/discovery';
import { formatNaira } from '@parkly/domain/money';
import { Button, Text, useTheme } from '@parkly/ui-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, View } from 'react-native';
import { useAuth } from '../../../src/auth/AuthProvider';
import { Notice } from '../../../src/components/Notice';
import { QrCode } from '../../../src/components/QrCode';
import { Screen } from '../../../src/components/Screen';
import { SelfCheck } from '../../../src/components/SelfCheck';
import { StayTimer } from '../../../src/components/StayTimer';
import { ApiError } from '../../../src/lib/api';
import { api, tickets } from '../../../src/lib/client';
import { GENERIC_ERROR_MESSAGE } from '../../../src/logic/errors';

const POLL_MS = 3_000;
/** While waiting for the gate or parked: pick up check-in, check-out and live overstay. */
const STAY_POLL_MS = 30_000;

export default function BookingScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { me } = useAuth();
  const userId = me?.id;
  const [booking, setBooking] = useState<Booking | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [offline, setOffline] = useState(false);
  /** Bumped after a self check-in so the screen reloads straight away. */
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let live = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const load = async () => {
      try {
        const b = await api.booking(id);
        if (!live) return;
        setBooking(b);
        setOffline(false);
        if (userId && b.qrToken) void tickets.put(userId, b).catch(() => undefined);
        // A webhook may still be confirming it; keep looking while it waits.
        if (b.status === 'PENDING_PAYMENT') timer = setTimeout(() => void load(), POLL_MS);
        else if (b.status === 'CONFIRMED' || b.status === 'CHECKED_IN' || b.status === 'NO_SHOW')
          timer = setTimeout(() => void load(), STAY_POLL_MS);
      } catch (err) {
        if (!live) return;
        // No signal at the gate: show the ticket saved when it was last online.
        const saved =
          err instanceof ApiError && err.status === 0 && userId
            ? await tickets.find(userId, id).catch(() => null)
            : null;
        if (saved) {
          setBooking(saved);
          setOffline(true);
        } else setError(err instanceof ApiError ? err.message : GENERIC_ERROR_MESSAGE);
      }
    };
    void load();
    return () => {
      live = false;
      if (timer) clearTimeout(timer);
    };
  }, [id, userId, reload]);

  const footer = (
    <View style={{ gap: theme.space[2] }}>
      <Button label="My bookings" fullWidth onPress={() => router.replace('/bookings')} />
      <Button label="Home" variant="ghost" fullWidth onPress={() => router.replace('/home')} />
    </View>
  );

  if (!booking)
    return (
      <Screen footer={footer}>
        {error ? (
          <Notice message={error} />
        ) : (
          <ActivityIndicator accessibilityLabel="Loading booking" />
        )}
      </Screen>
    );

  const confirmed = booking.status === 'CONFIRMED' || booking.status === 'CHECKED_IN';
  const expiredOrCancelled =
    booking.status === 'EXPIRED' ||
    booking.status === 'CANCELLED' ||
    booking.status === 'NO_SHOW';

  const directionsUrl = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(
    `${booking.lot.name}, ${booking.lot.addressLine}`,
  )}`;

  // Status badge colors & label
  const getStatusBadge = () => {
    switch (booking.status) {
      case 'EXPIRED':
        return {
          label: 'NOT PAID IN TIME',
          bg: theme.color.status.danger.bg,
          fg: theme.color.status.danger.fg,
          border: 'rgba(239, 68, 68, 0.4)',
        };
      case 'CANCELLED':
        return {
          label: 'CANCELLED',
          bg: theme.color.status.danger.bg,
          fg: theme.color.status.danger.fg,
          border: 'rgba(239, 68, 68, 0.4)',
        };
      case 'NO_SHOW':
        return {
          label: 'NO SHOW',
          bg: theme.color.status.warning.bg,
          fg: theme.color.status.warning.fg,
          border: 'rgba(245, 158, 11, 0.4)',
        };
      case 'CONFIRMED':
        return {
          label: 'CONFIRMED',
          bg: theme.color.status.success.bg,
          fg: theme.color.status.success.fg,
          border: 'rgba(16, 185, 129, 0.4)',
        };
      case 'CHECKED_IN':
        return {
          label: 'CHECKED IN',
          bg: theme.color.bg['brand-subtle'],
          fg: theme.color.text.brand,
          border: 'rgba(19, 112, 102, 0.4)',
        };
      case 'COMPLETED':
        return {
          label: 'COMPLETED',
          bg: theme.color.bg.subtle,
          fg: theme.color.text.secondary,
          border: theme.color.border.default,
        };
      case 'PENDING_PAYMENT':
      default:
        return {
          label: 'WAITING FOR PAYMENT',
          bg: theme.color.status.warning.bg,
          fg: theme.color.status.warning.fg,
          border: 'rgba(245, 158, 11, 0.4)',
        };
    }
  };

  const statusBadge = getStatusBadge();

  return (
    <Screen footer={footer}>
      {/* Top Bar Navigation & Pass Reference Code */}
      <View
        style={{
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 4,
        }}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back to My Bookings"
          onPress={() => router.replace('/bookings')}
          hitSlop={8}
          style={({ pressed }) => ({
            flexDirection: 'row',
            alignItems: 'center',
            gap: 6,
            paddingVertical: 6,
            paddingHorizontal: 12,
            borderRadius: theme.radius.pill,
            borderWidth: 1,
            borderColor: theme.color.border.default,
            backgroundColor: pressed ? theme.color.bg.muted : theme.color.bg.surface,
          })}
        >
          <Text variant="body.sm" tone="secondary">
            ← Back to My Bookings
          </Text>
        </Pressable>

        <View
          style={{
            paddingVertical: 4,
            paddingHorizontal: 10,
            borderRadius: theme.radius.pill,
            backgroundColor: theme.color.bg.surface,
            borderWidth: 1,
            borderColor: theme.color.border.default,
          }}
        >
          <Text variant="code.sm" tone="secondary">
            PASS #{booking.code}
          </Text>
        </View>
      </View>

      {/* Status Tags & Heading Header */}
      <View style={{ gap: theme.space[2] }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <View
            style={{
              paddingVertical: 3,
              paddingHorizontal: 8,
              borderRadius: theme.radius.sm,
              backgroundColor: statusBadge.bg,
              borderWidth: 1,
              borderColor: statusBadge.border,
            }}
          >
            <Text
              variant="label.sm"
              style={{
                color: statusBadge.fg,
                fontSize: 11,
                fontWeight: '700',
                letterSpacing: 0.5,
              }}
            >
              {statusBadge.label}
            </Text>
          </View>

          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 4,
              paddingVertical: 3,
              paddingHorizontal: 8,
              borderRadius: theme.radius.sm,
              backgroundColor: theme.color.status.success.bg,
              borderWidth: 1,
              borderColor: 'rgba(16, 185, 129, 0.4)',
            }}
          >
            <Text
              variant="label.sm"
              style={{
                color: theme.color.status.success.fg,
                fontSize: 11,
                fontWeight: '700',
                letterSpacing: 0.5,
              }}
            >
              ✓ LASPA VERIFIED
            </Text>
          </View>
        </View>

        <Text variant="heading.lg">
          {confirmed
            ? `You’re booked at ${booking.lot.name}`
            : booking.status === 'EXPIRED'
              ? `Reservation expired · ${booking.lot.name}`
              : booking.status === 'CANCELLED'
                ? `Reservation cancelled · ${booking.lot.name}`
                : booking.status === 'COMPLETED'
                  ? `Completed stay · ${booking.lot.name}`
                  : `Waiting for payment · ${booking.lot.name}`}
        </Text>

        <Text tone="secondary">
          {bookingWindowLabel(booking)} · {booking.lot.addressLine}
        </Text>
      </View>

      {/* Offline Notice */}
      {offline ? (
        <Notice
          kind="info"
          message="You’re offline. This is the ticket saved on your phone; it still works at the gate."
        />
      ) : null}

      {/* Status Alert Banner (Expired / Cancelled / No Show) */}
      {expiredOrCancelled && (
        <View
          style={{
            backgroundColor: 'rgba(245, 158, 11, 0.08)',
            borderWidth: 1,
            borderColor: 'rgba(245, 158, 11, 0.35)',
            borderRadius: theme.radius.lg,
            padding: theme.space[4],
            gap: theme.space[3],
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
            <View
              style={{
                width: 28,
                height: 28,
                borderRadius: 14,
                backgroundColor: 'rgba(245, 158, 11, 0.2)',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Text style={{ fontSize: 14 }}>⚠️</Text>
            </View>

            <View style={{ flex: 1, gap: 4 }}>
              <Text variant="label.lg" style={{ color: theme.color.status.warning.fg }}>
                {booking.status === 'EXPIRED'
                  ? 'Reservation expired (not paid in time)'
                  : booking.status === 'NO_SHOW'
                    ? 'Missed reservation'
                    : 'Reservation cancelled'}
              </Text>
              <Text variant="body.sm" tone="secondary">
                {booking.status === 'EXPIRED'
                  ? 'This space hold was automatically released because payment was not completed within the reservation window. No funds were charged to your account.'
                  : 'This reservation is no longer active. If you need parking in Lagos, check real-time availability below.'}
              </Text>
            </View>
          </View>

          <View style={{ gap: 8, marginTop: 4 }}>
            <Button
              label="Book again at this car park"
              variant="primary"
              fullWidth
              onPress={() =>
                router.push({
                  pathname: '/lot/[slug]',
                  params: { slug: booking.lot.slug },
                })
              }
            />
            <Button
              label="🔍 Search other car parks"
              variant="secondary"
              fullWidth
              onPress={() => router.replace('/home')}
            />
          </View>
        </View>
      )}

      {/* Pending Payment Alert Banner */}
      {booking.status === 'PENDING_PAYMENT' && (
        <View
          style={{
            backgroundColor: theme.color.status.info.bg,
            borderWidth: 1,
            borderColor: 'rgba(59, 130, 246, 0.35)',
            borderRadius: theme.radius.lg,
            padding: theme.space[4],
            gap: 6,
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <ActivityIndicator size="small" color={theme.color.status.info.fg} />
            <Text variant="label.lg" style={{ color: theme.color.status.info.fg }}>
              Confirming payment with Paystack
            </Text>
          </View>
          <Text variant="body.sm" tone="secondary">
            We are waiting for Paystack to complete your transaction. This page automatically updates every 3 seconds.
          </Text>
        </View>
      )}

      {/* Active Stay Timer & Self-Checkin */}
      <StayTimer booking={booking} />
      {offline ? null : <SelfCheck booking={booking} onDone={() => setReload((n) => n + 1)} />}

      {/* Official Gate Ticket (Confirmed & Active) */}
      {confirmed && !booking.stay?.checkedOutAt && (
        <View
          style={{
            backgroundColor: theme.card.bg,
            borderWidth: 1,
            borderColor: theme.card.border,
            borderRadius: theme.radius.lg,
            padding: theme.space[4],
            alignItems: 'center',
            gap: theme.space[3],
          }}
        >
          <View style={{ alignItems: 'center', gap: 2 }}>
            <Text variant="label.lg">Official Parkly Gate Pass</Text>
            <Text variant="body.sm" tone="secondary">
              Show to attendant or scan at barrier
            </Text>
          </View>

          {booking.qrToken ? (
            <View
              style={{
                padding: 12,
                borderRadius: theme.radius.md,
                backgroundColor: theme.color.qr.bg,
                borderWidth: 1,
                borderColor: theme.color.border.default,
              }}
            >
              <QrCode
                value={booking.qrToken}
                size={220}
                label={`QR ticket for booking ${booking.code}`}
              />
            </View>
          ) : null}

          <View style={{ alignItems: 'center', gap: 4 }}>
            <Text variant="body.sm" tone="secondary">
              Gate Pass Code
            </Text>
            <Text
              variant="heading.xl"
              style={{ letterSpacing: 2 }}
              accessibilityLabel={`Booking code ${booking.code.split('').join(' ')}`}
            >
              {booking.code}
            </Text>
          </View>

          <View
            style={{
              paddingVertical: 6,
              paddingHorizontal: 16,
              borderRadius: theme.radius.sm,
              backgroundColor: theme.color.bg.surface,
              borderWidth: 1,
              borderColor: theme.color.border.strong,
            }}
          >
            <Text variant="code.md" style={{ fontWeight: '700' }}>
              {booking.vehicle.plate}
            </Text>
          </View>

          {booking.overstay ? (
            <View
              style={{
                backgroundColor: theme.color.bg.subtle,
                padding: 10,
                borderRadius: theme.radius.sm,
                width: '100%',
              }}
            >
              <Text variant="body.sm" tone="secondary" style={{ textAlign: 'center' }}>
                {`Overstay rate: ${formatNaira(booking.overstay.per15Kobo)} per 15 min (after ${booking.overstay.graceMin} min grace)`}
              </Text>
            </View>
          ) : null}
        </View>
      )}

      {/* Facility & Access Card */}
      <View
        style={{
          backgroundColor: theme.card.bg,
          borderWidth: 1,
          borderColor: theme.card.border,
          borderRadius: theme.radius.lg,
          padding: theme.space[4],
          gap: theme.space[3],
        }}
      >
        <View
          style={{
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
            borderBottomWidth: 1,
            borderBottomColor: theme.color.border.default,
            paddingBottom: 10,
          }}
        >
          <Text variant="label.lg">Facility & Access</Text>
          <View
            style={{
              paddingVertical: 2,
              paddingHorizontal: 8,
              borderRadius: theme.radius.sm,
              backgroundColor: theme.color.bg['brand-subtle'],
              borderWidth: 1,
              borderColor: 'rgba(19, 112, 102, 0.35)',
            }}
          >
            <Text
              variant="label.sm"
              style={{
                color: theme.color.text.brand,
                fontSize: 10,
                fontWeight: '700',
                letterSpacing: 0.5,
              }}
            >
              VERIFIED LOCATION
            </Text>
          </View>
        </View>

        {/* Location Row */}
        <View style={{ flexDirection: 'row', gap: 12 }}>
          <Text style={{ fontSize: 18, marginTop: 2 }}>📍</Text>
          <View style={{ flex: 1, gap: 2 }}>
            <Text variant="label.md">{booking.lot.name}</Text>
            <Text variant="body.sm" tone="secondary">
              {booking.lot.addressLine}
            </Text>
            <View style={{ marginTop: 6 }}>
              <Button
                label="Get Directions on Google Maps ↗"
                size="sm"
                variant="secondary"
                onPress={() => void Linking.openURL(directionsUrl).catch(() => undefined)}
              />
            </View>
          </View>
        </View>

        {/* Reservation Window Row */}
        <View style={{ flexDirection: 'row', gap: 12 }}>
          <Text style={{ fontSize: 18, marginTop: 2 }}>📅</Text>
          <View style={{ flex: 1, gap: 2 }}>
            <Text variant="label.md">Reservation Window</Text>
            <Text variant="body.sm" tone="secondary">
              {bookingWindowLabel(booking)}
            </Text>
          </View>
        </View>

        {/* Registered Vehicle Row */}
        <View style={{ flexDirection: 'row', gap: 12 }}>
          <Text style={{ fontSize: 18, marginTop: 2 }}>🚗</Text>
          <View style={{ flex: 1, gap: 4 }}>
            <Text variant="label.md">Registered Vehicle</Text>
            <View
              style={{
                alignSelf: 'flex-start',
                paddingVertical: 3,
                paddingHorizontal: 10,
                borderRadius: theme.radius.sm,
                backgroundColor: theme.color.bg.surface,
                borderWidth: 1,
                borderColor: theme.color.border.default,
              }}
            >
              <Text variant="code.sm" style={{ fontWeight: '700' }}>
                {booking.vehicle.plate}
              </Text>
            </View>
          </View>
        </View>
      </View>

      {/* Receipt & Pricing Card */}
      <View
        style={{
          backgroundColor: theme.card.bg,
          borderWidth: 1,
          borderColor: theme.card.border,
          borderRadius: theme.radius.lg,
          padding: theme.space[4],
          gap: theme.space[3],
        }}
      >
        <View
          style={{
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
            borderBottomWidth: 1,
            borderBottomColor: theme.color.border.default,
            paddingBottom: 10,
          }}
        >
          <Text variant="label.lg">Receipt & Pricing</Text>
          <View
            style={{
              paddingVertical: 2,
              paddingHorizontal: 8,
              borderRadius: theme.radius.sm,
              backgroundColor: expiredOrCancelled
                ? theme.color.status.danger.bg
                : theme.color.status.success.bg,
              borderWidth: 1,
              borderColor: expiredOrCancelled
                ? 'rgba(239, 68, 68, 0.4)'
                : 'rgba(16, 185, 129, 0.4)',
            }}
          >
            <Text
              variant="label.sm"
              style={{
                color: expiredOrCancelled
                  ? theme.color.status.danger.fg
                  : theme.color.status.success.fg,
                fontSize: 10,
                fontWeight: '700',
                letterSpacing: 0.5,
              }}
            >
              {expiredOrCancelled ? 'NOT CHARGED' : 'PAID'}
            </Text>
          </View>
        </View>

        {/* Line items */}
        {booking.lines.map((l, i) => (
          <View
            key={i}
            style={{
              flexDirection: 'row',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <Text variant="body.sm" tone="secondary" style={{ flex: 1 }}>
              {lineLabel(l)}
            </Text>
            <Text variant="body.sm" style={{ fontWeight: '600' }}>
              {formatNaira(l.amountKobo)}
            </Text>
          </View>
        ))}

        {/* Divider */}
        <View
          style={{
            height: 1,
            backgroundColor: theme.color.border.default,
            marginVertical: 4,
          }}
        />

        {/* Total Quote / Total Paid */}
        <View
          style={{
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <Text variant="label.lg">
            {confirmed ? 'Total Paid' : 'Total Quote'}
          </Text>
          <Text
            variant="heading.md"
            style={{
              color: confirmed ? theme.color.text.brand : theme.color.text.primary,
            }}
          >
            {formatNaira(booking.totalKobo)}
          </Text>
        </View>

        {/* LASPA Guarantee Notice */}
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 8,
            backgroundColor: 'rgba(19, 112, 102, 0.08)',
            borderWidth: 1,
            borderColor: 'rgba(19, 112, 102, 0.25)',
            borderRadius: theme.radius.md,
            padding: 10,
            marginTop: 4,
          }}
        >
          <Text style={{ fontSize: 14 }}>🛡️</Text>
          <Text variant="body.sm" tone="secondary" style={{ flex: 1, lineHeight: 16 }}>
            Exact total with no hidden gate charges. Regulated with a Lagos State Parking Authority (LASPA) permit.
          </Text>
        </View>
      </View>

      {/* View Car Park Button */}
      <Button
        label="View car park details"
        variant="secondary"
        fullWidth
        onPress={() => router.push({ pathname: '/lot/[slug]', params: { slug: booking.lot.slug } })}
      />
    </Screen>
  );
}
