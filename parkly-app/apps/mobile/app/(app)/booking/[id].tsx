import type { Booking, ExtensionOptions } from '@parkly/contracts';
import { bookingWindowLabel } from '@parkly/domain/booking';
import { lineLabel } from '@parkly/domain/discovery';
import { formatNaira } from '@parkly/domain/money';
import { Button, Text, useTheme } from '@parkly/ui-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Linking, Modal, Pressable, View } from 'react-native';
import { useAuth } from '../../../src/auth/AuthProvider';
import { config } from '../../../src/lib/config';
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

const EXTEND_DURATIONS = [
  ...(config.testStays ? [{ label: '+5m (Test)', minutes: 5 }] : []),
  { label: '+15m', minutes: 15 },
  { label: '+30m', minutes: 30 },
  { label: '+45m', minutes: 45 },
  { label: '+1h', minutes: 60 },
  { label: '+2h', minutes: 120 },
];

const CANCEL_REASONS = [
  { id: 'CHANGE_OF_PLANS', label: 'Change of plans' },
  { id: 'FOUND_ALTERNATIVE', label: 'Found other parking' },
  { id: 'EMERGENCY', label: 'Vehicle issue / emergency' },
  { id: 'BOOKED_BY_MISTAKE', label: 'Booked by mistake' },
  { id: 'OTHER', label: 'Other reason' },
];

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

  // Lifecycle state
  const [extendOpen, setExtendOpen] = useState(false);
  const [extendMinutes, setExtendMinutes] = useState(30);
  const [extensionOptions, setExtensionOptions] = useState<ExtensionOptions | null>(null);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState('CHANGE_OF_PLANS');
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  useEffect(() => {
    if (extendOpen && booking) {
      api
        .extensionOptions(booking.id)
        .then((opts) => {
          setExtensionOptions(opts);
          if (opts.extendableUntil) {
            const maxMs = new Date(opts.extendableUntil).getTime();
            const curEndMs = new Date(booking.endAt).getTime();
            const allowed = EXTEND_DURATIONS.filter((o) => curEndMs + o.minutes * 60_000 <= maxMs);
            const first = allowed[0];
            if (first && !allowed.some((a) => a.minutes === extendMinutes)) {
              setExtendMinutes(first.minutes);
            }
          }
        })
        .catch(() => undefined);
    }
  }, [extendOpen, booking?.id]);

  const handleExtend = async () => {
    if (!booking) return;
    setActionLoading(true);
    setActionError(null);
    try {
      const currentEnd = new Date(booking.endAt);
      const newEndAt = new Date(currentEnd.getTime() + extendMinutes * 60_000).toISOString();
      const idempotencyKey = `ext-${booking.id}-${new Date(newEndAt).getTime()}`;
      const res = await api.extendBooking(booking.id, { newEndAt }, idempotencyKey);
      setExtendOpen(false);
      setActionLoading(false);
      if (res.payment?.authorizationUrl) {
        router.push({
          pathname: '/pay/[reference]',
          params: {
            reference: res.payment.reference,
            url: res.payment.authorizationUrl,
            bookingId: booking.id,
          },
        });
      } else {
        setActionSuccess(`Stay extended by ${extendMinutes} minutes.`);
        setReload((n) => n + 1);
      }
    } catch (err) {
      setActionLoading(false);
      setActionError(err instanceof ApiError ? err.message : GENERIC_ERROR_MESSAGE);
    }
  };

  const handleCancel = async () => {
    if (!booking) return;
    setActionLoading(true);
    setActionError(null);
    try {
      const idempotencyKey = `can-${booking.id}`;
      const res = await api.cancelBooking(booking.id, { reason: cancelReason }, idempotencyKey);
      setCancelOpen(false);
      setActionLoading(false);
      setActionSuccess(
        res.isFreeCancellation && res.refundKobo > 0
          ? `Booking cancelled. A full refund of ${formatNaira(res.refundKobo)} has been initiated.`
          : 'Booking cancelled.',
      );
      setReload((n) => n + 1);
    } catch (err) {
      setActionLoading(false);
      setActionError(err instanceof ApiError ? err.message : GENERIC_ERROR_MESSAGE);
    }
  };

  const handlePayOverstay = async () => {
    if (!booking) return;
    setActionLoading(true);
    setActionError(null);
    try {
      const idempotencyKey = `ovr-${booking.id}-${Date.now()}`;
      const res = await api.payOverstay(booking.id, {}, idempotencyKey);
      setActionLoading(false);
      if (res.payment.authorizationUrl) {
        router.push({
          pathname: '/pay/[reference]',
          params: {
            reference: res.payment.reference,
            url: res.payment.authorizationUrl,
            bookingId: booking.id,
          },
        });
      } else {
        setReload((n) => n + 1);
      }
    } catch (err) {
      setActionLoading(false);
      setActionError(err instanceof ApiError ? err.message : GENERIC_ERROR_MESSAGE);
    }
  };

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
    booking.status === 'EXPIRED' || booking.status === 'CANCELLED' || booking.status === 'NO_SHOW';

  const destinationCoords = booking.lot.location
    ? `${booking.lot.location.lat},${booking.lot.location.lng}`
    : `${booking.lot.name}, ${booking.lot.addressLine}`;
  const directionsUrl = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(
    destinationCoords,
  )}`;

  const rawContact = booking.lot.contactPhone?.trim();
  const waDigits = rawContact?.replace(/[^\d]/g, '');
  const waClean = waDigits?.startsWith('0') ? `234${waDigits.slice(1)}` : waDigits;
  const whatsappUrl = waClean
    ? `https://wa.me/${waClean}?text=${encodeURIComponent(
        `Hi, I have a reservation at ${booking.lot.name} (Pass #${booking.code}). Need help with gate directions.`,
      )}`
    : null;
  const phoneCallUrl = rawContact ? `tel:${rawContact}` : null;

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
            We are waiting for Paystack to complete your transaction. This page automatically
            updates every 3 seconds.
          </Text>
        </View>
      )}

      {/* Active Stay Timer & Self-Checkin */}
      <StayTimer booking={booking} />
      {offline ? null : <SelfCheck booking={booking} onDone={() => setReload((n) => n + 1)} />}

      {/* Unpaid Overstay Alert Banner */}
      {/* Only while owed: a paid or waived overstay keeps its amount for the record. */}
      {booking.stay &&
        booking.stay.overstayKobo > 0 &&
        (booking.stay.overstayStatus === undefined ||
          booking.stay.overstayStatus === 'DUE' ||
          booking.stay.overstayStatus === 'UNPAID') && (
          <View
            style={{
              backgroundColor: theme.color.status.danger.bg,
              borderWidth: 1,
              borderColor: 'rgba(239, 68, 68, 0.45)',
              borderRadius: theme.radius.lg,
              padding: theme.space[4],
              gap: 10,
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Text style={{ fontSize: 20 }}>⚠️</Text>
              <View style={{ flex: 1 }}>
                <Text variant="label.lg" style={{ color: theme.color.status.danger.fg }}>
                  {`Unpaid Overstay Due · ${formatNaira(booking.stay.overstayKobo)}`}
                </Text>
                <Text variant="body.sm" tone="secondary">
                  {`Vehicle exceeded booked stay by ${booking.stay.overstayMinutes} minutes. Settle before exit.`}
                </Text>
              </View>
            </View>
            <Button
              label={
                actionLoading
                  ? 'Connecting...'
                  : `Pay Overstay (${formatNaira(booking.stay.overstayKobo)})`
              }
              variant="danger"
              fullWidth
              disabled={actionLoading}
              onPress={handlePayOverstay}
            />
          </View>
        )}

      {/* Action Success / Error Notices */}
      {actionSuccess ? <Notice kind="success" message={actionSuccess} /> : null}
      {actionError ? <Notice kind="danger" message={actionError} /> : null}

      {/* Lifecycle Action Buttons */}
      <View style={{ flexDirection: 'row', gap: 10 }}>
        {confirmed && !booking.stay?.checkedOutAt && (
          <View style={{ flex: 1 }}>
            <Button
              label="Extend Stay"
              variant="primary"
              fullWidth
              disabled={offline || actionLoading}
              onPress={() => {
                setActionError(null);
                setExtendOpen(true);
              }}
            />
          </View>
        )}
        {booking.status === 'CONFIRMED' && !booking.stay?.checkedInAt && (
          <View style={{ flex: 1 }}>
            <Button
              label="Cancel Booking"
              variant="secondary"
              fullWidth
              disabled={offline || actionLoading}
              onPress={() => {
                setActionError(null);
                setCancelOpen(true);
              }}
            />
          </View>
        )}
      </View>

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

          {booking.lot.entranceNotes ? (
            <View
              style={{
                backgroundColor: theme.color.bg.subtle,
                borderLeftWidth: 3,
                borderLeftColor: theme.color.border.brand,
                borderRadius: theme.radius.sm,
                padding: 10,
                width: '100%',
                gap: 2,
              }}
            >
              <Text variant="label.sm" tone="secondary">
                GATE / ENTRANCE LANDMARK
              </Text>
              <Text variant="body.sm" style={{ fontWeight: '600' }}>
                {booking.lot.entranceNotes}
              </Text>
            </View>
          ) : null}

          {phoneCallUrl || whatsappUrl ? (
            <View style={{ width: '100%', gap: 6, marginTop: 2 }}>
              <Text variant="label.sm" tone="secondary" style={{ textAlign: 'center' }}>
                Need help finding the gate?
              </Text>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                {phoneCallUrl ? (
                  <View style={{ flex: 1 }}>
                    <Button
                      label="📞 Call Gate"
                      variant="secondary"
                      size="sm"
                      fullWidth
                      onPress={() => void Linking.openURL(phoneCallUrl).catch(() => undefined)}
                    />
                  </View>
                ) : null}
                {whatsappUrl ? (
                  <View style={{ flex: 1 }}>
                    <Button
                      label="💬 WhatsApp Gate"
                      variant="secondary"
                      size="sm"
                      fullWidth
                      onPress={() => void Linking.openURL(whatsappUrl).catch(() => undefined)}
                    />
                  </View>
                ) : null}
              </View>
            </View>
          ) : null}

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

        {/* Entrance Landmark Row */}
        {booking.lot.entranceNotes ? (
          <View style={{ flexDirection: 'row', gap: 12 }}>
            <Text style={{ fontSize: 18, marginTop: 2 }}>🚪</Text>
            <View style={{ flex: 1, gap: 2 }}>
              <Text variant="label.md">Entrance Landmark & Notes</Text>
              <Text variant="body.sm" tone="secondary">
                {booking.lot.entranceNotes}
              </Text>
            </View>
          </View>
        ) : null}

        {/* Gate Attendant Contact Row */}
        {phoneCallUrl || whatsappUrl ? (
          <View style={{ flexDirection: 'row', gap: 12 }}>
            <Text style={{ fontSize: 18, marginTop: 2 }}>📞</Text>
            <View style={{ flex: 1, gap: 4 }}>
              <Text variant="label.md">Gate Attendant Contact</Text>
              {booking.lot.contactPhone ? (
                <Text variant="body.sm" tone="secondary">
                  {booking.lot.contactPhone}
                </Text>
              ) : null}
              <View style={{ flexDirection: 'row', gap: 8, marginTop: 4 }}>
                {phoneCallUrl ? (
                  <View style={{ flex: 1 }}>
                    <Button
                      label="Call Gate"
                      variant="secondary"
                      size="sm"
                      fullWidth
                      onPress={() => void Linking.openURL(phoneCallUrl).catch(() => undefined)}
                    />
                  </View>
                ) : null}
                {whatsappUrl ? (
                  <View style={{ flex: 1 }}>
                    <Button
                      label="WhatsApp"
                      variant="secondary"
                      size="sm"
                      fullWidth
                      onPress={() => void Linking.openURL(whatsappUrl).catch(() => undefined)}
                    />
                  </View>
                ) : null}
              </View>
            </View>
          </View>
        ) : null}
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
          <Text variant="label.lg">{confirmed ? 'Total Paid' : 'Total Quote'}</Text>
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
            Exact total with no hidden gate charges. Regulated with a Lagos State Parking Authority
            (LASPA) permit.
          </Text>
        </View>

        <Button
          label="View Official Receipt ↗"
          variant="secondary"
          fullWidth
          onPress={async () => {
            try {
              const url = await api.receiptUrl(booking.id);
              await Linking.openURL(url);
            } catch {
              // ignore
            }
          }}
        />
        <Button
          label="Download PDF receipt"
          variant="secondary"
          fullWidth
          onPress={async () => {
            try {
              await Linking.openURL(await api.receiptUrl(booking.id, 'pdf'));
            } catch {
              // ignore
            }
          }}
        />
      </View>

      {/* View Car Park Button */}
      <Button
        label="View car park details"
        variant="secondary"
        fullWidth
        onPress={() => router.push({ pathname: '/lot/[slug]', params: { slug: booking.lot.slug } })}
      />

      {/* Extend Stay Modal */}
      <Modal visible={extendOpen} transparent animationType="slide">
        <View
          style={{
            flex: 1,
            backgroundColor: 'rgba(0, 0, 0, 0.65)',
            justifyContent: 'flex-end',
          }}
        >
          <View
            style={{
              backgroundColor: theme.card.bg,
              borderTopLeftRadius: theme.radius.lg,
              borderTopRightRadius: theme.radius.lg,
              borderWidth: 1,
              borderColor: theme.card.border,
              padding: theme.space[4],
              gap: theme.space[3],
            }}
          >
            <View
              style={{
                flexDirection: 'row',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <View>
                <Text variant="label.lg">Extend Parking Stay</Text>
                <Text variant="body.sm" tone="secondary">
                  Choose extra duration for {booking.lot.name}
                </Text>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Close"
                onPress={() => setExtendOpen(false)}
                hitSlop={8}
              >
                <Text variant="label.lg" tone="secondary">
                  ✕
                </Text>
              </Pressable>
            </View>

            {extensionOptions && extensionOptions.extendableUntil === null ? (
              <Notice
                kind="warning"
                message={
                  extensionOptions.closesAt
                    ? `The car park closes at ${new Date(extensionOptions.closesAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Africa/Lagos' })}${extensionOptions.reopensAt ? ` and reopens ${new Date(extensionOptions.reopensAt).toLocaleDateString('en-GB', { weekday: 'short', timeZone: 'Africa/Lagos' })} ${new Date(extensionOptions.reopensAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Africa/Lagos' })}` : ''}. No extension is available.`
                    : 'The car park is closed during the extension window.'
                }
              />
            ) : null}

            {/* Duration Chips */}
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {EXTEND_DURATIONS.map((opt) => {
                const selected = extendMinutes === opt.minutes;
                const isPastClosing = Boolean(
                  extensionOptions &&
                  (extensionOptions.extendableUntil === null ||
                    new Date(booking.endAt).getTime() + opt.minutes * 60_000 >
                      new Date(extensionOptions.extendableUntil).getTime()),
                );
                return (
                  <Pressable
                    key={opt.minutes}
                    disabled={isPastClosing}
                    onPress={() => setExtendMinutes(opt.minutes)}
                    style={{
                      paddingVertical: 10,
                      paddingHorizontal: 16,
                      borderRadius: theme.radius.sm,
                      backgroundColor: selected ? theme.color.bg.brand : theme.color.bg.surface,
                      borderWidth: 1,
                      borderColor: selected ? theme.color.border.brand : theme.color.border.default,
                      opacity: isPastClosing ? 0.35 : 1,
                    }}
                  >
                    <Text
                      variant="label.md"
                      style={{
                        color: selected ? '#ffffff' : theme.color.text.primary,
                        fontWeight: '700',
                      }}
                    >
                      {opt.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <View
              style={{
                backgroundColor: theme.color.bg.subtle,
                padding: 12,
                borderRadius: theme.radius.sm,
                gap: 4,
              }}
            >
              <Text variant="body.sm" tone="secondary">
                {`New Exit Time: ${new Date(new Date(booking.endAt).getTime() + extendMinutes * 60_000).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'Africa/Lagos' })}`}
              </Text>
              <Text variant="body.sm" tone="secondary">
                Payment will be calculated using car park rates.
              </Text>
            </View>

            {actionError && <Notice kind="danger" message={actionError} />}

            <View style={{ gap: 8, marginTop: 4 }}>
              <Button
                label={actionLoading ? 'Extending...' : `Confirm +${extendMinutes} Mins`}
                variant="primary"
                fullWidth
                loading={actionLoading}
                disabled={
                  actionLoading ||
                  Boolean(
                    extensionOptions &&
                    (extensionOptions.extendableUntil === null ||
                      new Date(booking.endAt).getTime() + extendMinutes * 60_000 >
                        new Date(extensionOptions.extendableUntil).getTime()),
                  )
                }
                onPress={handleExtend}
              />
              <Button
                label="Dismiss"
                variant="ghost"
                fullWidth
                onPress={() => setExtendOpen(false)}
              />
            </View>
          </View>
        </View>
      </Modal>

      {/* Cancel Booking Modal */}
      <Modal visible={cancelOpen} transparent animationType="slide">
        <View
          style={{
            flex: 1,
            backgroundColor: 'rgba(0, 0, 0, 0.65)',
            justifyContent: 'flex-end',
          }}
        >
          <View
            style={{
              backgroundColor: theme.card.bg,
              borderTopLeftRadius: theme.radius.lg,
              borderTopRightRadius: theme.radius.lg,
              borderWidth: 1,
              borderColor: theme.card.border,
              padding: theme.space[4],
              gap: theme.space[3],
            }}
          >
            <View
              style={{
                flexDirection: 'row',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <View>
                <Text variant="label.lg">Cancel Reservation</Text>
                <Text variant="body.sm" tone="secondary">
                  Pass #{booking.code} at {booking.lot.name}
                </Text>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Close"
                onPress={() => setCancelOpen(false)}
                hitSlop={8}
              >
                <Text variant="label.lg" tone="secondary">
                  ✕
                </Text>
              </Pressable>
            </View>

            {/* Policy Notice */}
            {(() => {
              const msToStart = new Date(booking.startAt).getTime() - Date.now();
              const isFree = msToStart >= 30 * 60_000;
              return isFree ? (
                <View
                  style={{
                    backgroundColor: theme.color.status.success.bg,
                    borderWidth: 1,
                    borderColor: 'rgba(16, 185, 129, 0.35)',
                    borderRadius: theme.radius.md,
                    padding: 12,
                    gap: 4,
                  }}
                >
                  <Text variant="label.md" style={{ color: theme.color.status.success.fg }}>
                    Free Cancellation Eligible
                  </Text>
                  <Text variant="body.sm" tone="secondary">
                    {`You are cancelling over 30 mins before start. Full refund of ${formatNaira(booking.totalKobo)} will be returned.`}
                  </Text>
                </View>
              ) : (
                <View
                  style={{
                    backgroundColor: theme.color.status.danger.bg,
                    borderWidth: 1,
                    borderColor: 'rgba(239, 68, 68, 0.35)',
                    borderRadius: theme.radius.md,
                    padding: 12,
                    gap: 4,
                  }}
                >
                  <Text variant="label.md" style={{ color: theme.color.status.danger.fg }}>
                    Late Cancellation (No Refund)
                  </Text>
                  <Text variant="body.sm" tone="secondary">
                    Cancellations within 30 minutes of booked start time are non-refundable per car
                    park policy.
                  </Text>
                </View>
              );
            })()}

            {/* Reason selector */}
            <Text variant="label.sm" tone="secondary">
              Select cancellation reason:
            </Text>
            <View style={{ gap: 6 }}>
              {CANCEL_REASONS.map((r) => {
                const selected = cancelReason === r.id;
                return (
                  <Pressable
                    key={r.id}
                    onPress={() => setCancelReason(r.id)}
                    style={{
                      padding: 10,
                      borderRadius: theme.radius.sm,
                      backgroundColor: selected ? theme.color.bg.subtle : 'transparent',
                      borderWidth: 1,
                      borderColor: selected ? theme.color.border.brand : theme.color.border.default,
                    }}
                  >
                    <Text variant="body.sm" style={{ fontWeight: selected ? '700' : '400' }}>
                      {r.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <View style={{ gap: 8, marginTop: 4 }}>
              <Button
                label={actionLoading ? 'Cancelling...' : 'Confirm Cancellation'}
                variant="danger"
                fullWidth
                loading={actionLoading}
                onPress={handleCancel}
              />
              <Button
                label="Keep Booking"
                variant="ghost"
                fullWidth
                onPress={() => setCancelOpen(false)}
              />
            </View>
          </View>
        </View>
      </Modal>
    </Screen>
  );
}
