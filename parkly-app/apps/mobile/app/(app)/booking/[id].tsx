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
import { ActionSheet, type ActionSheetItem } from '../../../src/components/ActionSheet';
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

/** Plain label/value row for the Facility & Access card (doc 14 P16): no decorative icons. */
function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <View style={{ gap: 2 }}>
      <Text variant="label.sm" tone="secondary">
        {label}
      </Text>
      {typeof value === 'string' ? <Text variant="body.md">{value}</Text> : value}
    </View>
  );
}

/** "More actions" trigger row, inline at the bottom of the facility card. */
function MoreActionsRow({ onPress, count }: { onPress: () => void; count: number }) {
  const theme = useTheme();
  if (count === 0) return null;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="More actions: directions, contact & receipts"
      onPress={onPress}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        minHeight: theme.target.min,
        marginHorizontal: -theme.space.inset.sm,
        paddingHorizontal: theme.space.inset.sm,
        borderTopWidth: 1,
        borderTopColor: theme.color.border.default,
        backgroundColor: pressed ? theme.color.bg.subtle : 'transparent',
      })}
    >
      <Text variant="label.md" tone="brand">
        Directions, contact & receipts
      </Text>
      <Text variant="label.lg" tone="tertiary">
        ›
      </Text>
    </Pressable>
  );
}

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
  const [moreOpen, setMoreOpen] = useState(false);
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
            kind: 'extension',
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
    if (!booking.stay?.checkedOutAt) {
      setActionError(
        'Please check out first. Overstay charges continue calculating until checkout.',
      );
      return;
    }
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
            kind: 'overstay',
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
    <View style={{ flexDirection: 'row', gap: theme.space.inline.sm }}>
      <View style={{ flex: 1 }}>
        <Button
          label="My bookings"
          variant="secondary"
          fullWidth
          onPress={() => router.replace('/bookings')}
        />
      </View>
      <View style={{ flex: 1 }}>
        <Button label="Home" variant="ghost" fullWidth onPress={() => router.replace('/home')} />
      </View>
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

  const isPendingPayment = booking.status === 'PENDING_PAYMENT';
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
        };
      case 'CANCELLED':
        return {
          label: 'CANCELLED',
          bg: theme.color.status.danger.bg,
          fg: theme.color.status.danger.fg,
        };
      case 'NO_SHOW':
        return {
          label: 'NO SHOW',
          bg: theme.color.status.warning.bg,
          fg: theme.color.status.warning.fg,
        };
      case 'CONFIRMED':
        return {
          label: 'CONFIRMED',
          bg: theme.color.status.success.bg,
          fg: theme.color.status.success.fg,
        };
      case 'CHECKED_IN':
        return {
          label: 'CHECKED IN',
          bg: theme.color.bg['brand-subtle'],
          fg: theme.color.text.brand,
        };
      case 'COMPLETED':
        return { label: 'COMPLETED', bg: theme.color.bg.subtle, fg: theme.color.text.secondary };
      case 'PENDING_PAYMENT':
      default:
        return {
          label: 'WAITING FOR PAYMENT',
          bg: theme.color.status.warning.bg,
          fg: theme.color.status.warning.fg,
        };
    }
  };

  const statusBadge = getStatusBadge();

  const moreActions: ActionSheetItem[] = [
    {
      label: 'Get directions',
      onPress: () => void Linking.openURL(directionsUrl).catch(() => undefined),
    },
    ...(phoneCallUrl
      ? [
          {
            label: 'Call gate attendant',
            onPress: () => void Linking.openURL(phoneCallUrl).catch(() => undefined),
          },
        ]
      : []),
    ...(whatsappUrl
      ? [
          {
            label: 'WhatsApp gate attendant',
            onPress: () => void Linking.openURL(whatsappUrl).catch(() => undefined),
          },
        ]
      : []),
    {
      label: 'View car park details',
      onPress: () => router.push({ pathname: '/lot/[slug]', params: { slug: booking.lot.slug } }),
    },
    ...(confirmed
      ? [
          {
            label: 'View official receipt',
            onPress: () => {
              void api
                .receiptUrl(booking.id)
                .then((url) => Linking.openURL(url))
                .catch(() => undefined);
            },
          },
          {
            label: 'Download PDF receipt',
            onPress: () => {
              void api
                .receiptUrl(booking.id, 'pdf')
                .then((url) => Linking.openURL(url))
                .catch(() => undefined);
            },
          },
        ]
      : []),
  ];

  return (
    <Screen footer={footer}>
      {/* Top bar: back navigation & pass reference code */}
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back to My Bookings"
          onPress={() => router.replace('/bookings')}
          hitSlop={8}
        >
          <Text variant="body.sm" tone="secondary">
            ← Back
          </Text>
        </Pressable>

        <Text variant="code.sm" tone="secondary">
          PASS #{booking.code}
        </Text>
      </View>

      {/* Status & heading */}
      <View style={{ gap: theme.space.stack.xs }}>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: theme.space.inline.sm,
            flexWrap: 'wrap',
          }}
        >
          <View
            style={{
              height: 24,
              justifyContent: 'center',
              paddingHorizontal: theme.space[2],
              borderRadius: theme.radius.pill,
              backgroundColor: statusBadge.bg,
            }}
          >
            <Text variant="label.sm" style={{ color: statusBadge.fg, fontWeight: '700' }}>
              {statusBadge.label}
            </Text>
          </View>

          <View
            style={{
              height: 24,
              justifyContent: 'center',
              paddingHorizontal: theme.space[2],
              borderRadius: theme.radius.pill,
              backgroundColor: theme.badge.verified.bg,
            }}
          >
            <Text variant="label.sm" style={{ color: theme.badge.verified.fg, fontWeight: '700' }}>
              LASPA Verified
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

      {/* Offline notice */}
      {offline ? (
        <Notice
          kind="info"
          message="You’re offline. This is the ticket saved on your phone; it still works at the gate."
        />
      ) : null}

      {/* Status alert banner (expired / cancelled / no show) */}
      {expiredOrCancelled && (
        <View
          style={{
            backgroundColor: theme.color.status.warning.bg,
            borderLeftWidth: 4,
            borderLeftColor: theme.color.status.warning.icon,
            borderRadius: theme.radius.surface,
            padding: theme.space.inset.md,
            gap: theme.space.stack.sm,
          }}
        >
          <View style={{ gap: 4 }}>
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

          <View style={{ gap: theme.space.stack.xs }}>
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
              label="Search other car parks"
              variant="secondary"
              fullWidth
              onPress={() => router.replace('/home')}
            />
          </View>
        </View>
      )}

      {/* Pending payment alert banner */}
      {booking.status === 'PENDING_PAYMENT' && (
        <View
          style={{
            backgroundColor: theme.color.status.info.bg,
            borderLeftWidth: 4,
            borderLeftColor: theme.color.status.info.icon,
            borderRadius: theme.radius.surface,
            padding: theme.space.inset.md,
            gap: theme.space.stack.xs,
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.space.inline.sm }}>
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

      {/* Park Now flexible hold notices */}
      {booking.bookingType === 'PARK_NOW' &&
        booking.status === 'CONFIRMED' &&
        !booking.stay?.checkedInAt && (
          <Notice
            kind="info"
            message="Park now active: your space is held. Drive to the car park and check in — your parking stay timer will start when you arrive!"
          />
        )}
      {booking.holdingFeeKobo > 0 && (
        <Notice
          kind="warning"
          message={`Accrued holding fee: ${formatNaira(booking.holdingFeeKobo)} (for holding past the 60 min courtesy window; collected at checkout).`}
        />
      )}

      {/* Active stay timer & self-checkin */}
      <StayTimer booking={booking} />
      {offline ? null : <SelfCheck booking={booking} onDone={() => setReload((n) => n + 1)} />}

      {/* Unpaid overstay alert banner */}
      {/* Only while owed: a paid or waived overstay keeps its amount for the record. */}
      {booking.stay &&
        booking.stay.overstayKobo > 0 &&
        (booking.stay.overstayStatus === undefined ||
          booking.stay.overstayStatus === 'DUE' ||
          booking.stay.overstayStatus === 'UNPAID') && (
          <View
            style={{
              backgroundColor: booking.stay.checkedOutAt
                ? theme.color.status.danger.bg
                : theme.color.status.warning.bg,
              borderLeftWidth: 4,
              borderLeftColor: booking.stay.checkedOutAt
                ? theme.color.status.danger.icon
                : theme.color.status.warning.icon,
              borderRadius: theme.radius.surface,
              padding: theme.space.inset.md,
              gap: theme.space.stack.sm,
            }}
          >
            <View style={{ gap: 2 }}>
              <Text
                variant="label.lg"
                style={{
                  color: booking.stay.checkedOutAt
                    ? theme.color.status.danger.fg
                    : theme.color.status.warning.fg,
                }}
              >
                {booking.stay.checkedOutAt
                  ? `Unpaid overstay due · ${formatNaira(booking.stay.overstayKobo)}`
                  : `Overstay in progress · ${formatNaira(booking.stay.overstayKobo)}`}
              </Text>
              <Text variant="body.sm" tone="secondary">
                {booking.stay.checkedOutAt
                  ? `Vehicle exceeded booked stay by ${booking.stay.overstayMinutes} minutes. Settle before exit.`
                  : `Vehicle exceeded booked stay by ${booking.stay.overstayMinutes} minutes. Check out at the barrier or attendant first to finalize your balance.`}
              </Text>
            </View>
            {booking.stay.checkedOutAt ? (
              <Button
                label={
                  actionLoading
                    ? 'Connecting...'
                    : `Pay overstay (${formatNaira(booking.stay.overstayKobo)})`
                }
                variant="danger"
                fullWidth
                disabled={actionLoading}
                onPress={handlePayOverstay}
              />
            ) : (
              <Button
                label="Check out to finalize payment"
                variant="secondary"
                fullWidth
                disabled={actionLoading}
                onPress={() => {
                  setActionError(null);
                  setActionSuccess(
                    'Please tap "Check out (scan barrier or attendant)" above to close your stay first.',
                  );
                }}
              />
            )}
          </View>
        )}

      {/* Action success / error notices */}
      {actionSuccess ? <Notice kind="success" message={actionSuccess} /> : null}
      {actionError ? <Notice kind="danger" message={actionError} /> : null}

      {/* Lifecycle action buttons */}
      <View style={{ flexDirection: 'row', gap: theme.space.inline.sm }}>
        {confirmed && !booking.stay?.checkedOutAt && (
          <View style={{ flex: 1 }}>
            <Button
              label="Extend stay"
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
              label="Cancel booking"
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

      {/* Official gate ticket (confirmed & active) */}
      {confirmed && !booking.stay?.checkedOutAt && (
        <View
          style={{
            backgroundColor: theme.card.bg,
            borderWidth: 1,
            borderColor: theme.card.border,
            borderRadius: theme.card.radius,
            padding: theme.card.padding,
            alignItems: 'center',
            gap: theme.space.stack.md,
          }}
        >
          <View style={{ alignItems: 'center', gap: 2 }}>
            <Text variant="label.lg">Official Parkly gate pass</Text>
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
              Gate pass code
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
              backgroundColor: theme.color.bg.subtle,
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
                padding: theme.space.inset.sm,
                width: '100%',
                gap: 2,
              }}
            >
              <Text variant="label.sm" tone="secondary">
                Gate / entrance landmark
              </Text>
              <Text variant="body.sm" style={{ fontWeight: '600' }}>
                {booking.lot.entranceNotes}
              </Text>
            </View>
          ) : null}

          {booking.overstay ? (
            <Text variant="body.sm" tone="secondary" style={{ textAlign: 'center' }}>
              {`Overstay rate: ${formatNaira(booking.overstay.per15Kobo)} per 15 min (after ${booking.overstay.graceMin} min grace)`}
            </Text>
          ) : null}
        </View>
      )}

      {/* Facility & access card */}
      <View
        style={{
          backgroundColor: theme.card.bg,
          borderWidth: 1,
          borderColor: theme.card.border,
          borderRadius: theme.card.radius,
          padding: theme.card.padding,
          gap: theme.space.stack.md,
        }}
      >
        <Text variant="label.lg">Facility & access</Text>

        <InfoRow label="Location" value={`${booking.lot.name}, ${booking.lot.addressLine}`} />
        <InfoRow label="Reservation window" value={bookingWindowLabel(booking)} />
        <InfoRow
          label="Registered vehicle"
          value={
            <View
              style={{
                alignSelf: 'flex-start',
                paddingVertical: 2,
                paddingHorizontal: theme.space[2],
                borderRadius: theme.radius.sm,
                backgroundColor: theme.color.bg.subtle,
              }}
            >
              <Text variant="code.sm" style={{ fontWeight: '700' }}>
                {booking.vehicle.plate}
              </Text>
            </View>
          }
        />
        {booking.lot.entranceNotes ? (
          <InfoRow label="Entrance landmark & notes" value={booking.lot.entranceNotes} />
        ) : null}
        {booking.lot.contactPhone ? (
          <InfoRow label="Gate attendant contact" value={booking.lot.contactPhone} />
        ) : null}

        <MoreActionsRow onPress={() => setMoreOpen(true)} count={moreActions.length} />
      </View>

      {/* Receipt & pricing card */}
      <View
        style={{
          backgroundColor: theme.card.bg,
          borderWidth: 1,
          borderColor: theme.card.border,
          borderRadius: theme.card.radius,
          padding: theme.card.padding,
          gap: theme.space.stack.sm,
        }}
      >
        <View
          style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}
        >
          <Text variant="label.lg">Receipt & pricing</Text>
          <View
            style={{
              height: 24,
              justifyContent: 'center',
              paddingHorizontal: theme.space[2],
              borderRadius: theme.radius.pill,
              backgroundColor: isPendingPayment
                ? theme.color.status.warning.bg
                : expiredOrCancelled
                  ? theme.color.status.danger.bg
                  : theme.color.status.success.bg,
            }}
          >
            <Text
              variant="label.sm"
              style={{
                color: isPendingPayment
                  ? theme.color.status.warning.fg
                  : expiredOrCancelled
                    ? theme.color.status.danger.fg
                    : theme.color.status.success.fg,
                fontWeight: '700',
              }}
            >
              {isPendingPayment
                ? 'Waiting for payment'
                : expiredOrCancelled
                  ? 'Not charged'
                  : 'Paid'}
            </Text>
          </View>
        </View>

        {/* Line items */}
        {booking.lines.map((l, i) => (
          <View
            key={i}
            style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}
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
        <View style={{ height: 1, backgroundColor: theme.color.border.default }} />

        {/* Total quote / total paid */}
        <View
          style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}
        >
          <Text variant="label.lg">
            {confirmed ? 'Total paid' : isPendingPayment ? 'Amount due' : 'Total quote'}
          </Text>
          <Text
            variant="heading.md"
            style={{
              color: confirmed
                ? theme.color.text.brand
                : isPendingPayment
                  ? theme.color.status.warning.fg
                  : theme.color.text.primary,
            }}
          >
            {formatNaira(booking.totalKobo)}
          </Text>
        </View>

        {isPendingPayment ? (
          <Notice
            kind="warning"
            message="Space is held for 10 minutes. If you cancelled checkout on Paystack, this reservation is still awaiting payment."
          />
        ) : null}

        <Text variant="body.sm" tone="secondary">
          Exact total with no hidden gate charges. Regulated with a Lagos State Parking Authority
          (LASPA) permit.
        </Text>
      </View>

      {/* Extend Stay Modal */}
      <Modal visible={extendOpen} transparent animationType="slide">
        <View
          style={{ flex: 1, backgroundColor: theme.color.bg.overlay, justifyContent: 'flex-end' }}
        >
          <View
            style={{
              backgroundColor: theme.color.bg['surface-raised'],
              borderTopLeftRadius: theme.radius.sheet,
              borderTopRightRadius: theme.radius.sheet,
              padding: theme.space.inset.lg,
              gap: theme.space.stack.md,
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
                <Text variant="label.lg">Extend parking stay</Text>
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
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.space.inline.sm }}>
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
                      minHeight: 36,
                      justifyContent: 'center',
                      paddingHorizontal: theme.space[3],
                      borderRadius: theme.radius.pill,
                      borderWidth: 1,
                      borderColor: selected ? theme.color.border.brand : theme.color.border.default,
                      backgroundColor: selected
                        ? theme.color.bg['brand-subtle']
                        : theme.color.bg.surface,
                      opacity: isPastClosing ? theme.opacity.disabled : 1,
                    }}
                  >
                    <Text
                      variant="label.md"
                      tone={selected ? 'brand' : 'primary'}
                      style={{ fontWeight: selected ? '700' : '500' }}
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
                padding: theme.space.inset.sm,
                borderRadius: theme.radius.sm,
                gap: 4,
              }}
            >
              <Text variant="body.sm" tone="secondary">
                {`New exit time: ${new Date(new Date(booking.endAt).getTime() + extendMinutes * 60_000).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'Africa/Lagos' })}`}
              </Text>
              <Text variant="body.sm" tone="secondary">
                Payment will be calculated using car park rates.
              </Text>
            </View>

            {actionError && <Notice kind="danger" message={actionError} />}

            <View style={{ gap: theme.space.stack.xs }}>
              <Button
                label={actionLoading ? 'Extending...' : `Confirm +${extendMinutes} mins`}
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
          style={{ flex: 1, backgroundColor: theme.color.bg.overlay, justifyContent: 'flex-end' }}
        >
          <View
            style={{
              backgroundColor: theme.color.bg['surface-raised'],
              borderTopLeftRadius: theme.radius.sheet,
              borderTopRightRadius: theme.radius.sheet,
              padding: theme.space.inset.lg,
              gap: theme.space.stack.md,
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
                <Text variant="label.lg">Cancel reservation</Text>
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
              return (
                <View
                  style={{
                    backgroundColor: isFree
                      ? theme.color.status.success.bg
                      : theme.color.status.danger.bg,
                    borderRadius: theme.radius.md,
                    padding: theme.space.inset.sm,
                    gap: 4,
                  }}
                >
                  <Text
                    variant="label.md"
                    style={{
                      color: isFree ? theme.color.status.success.fg : theme.color.status.danger.fg,
                    }}
                  >
                    {isFree ? 'Free cancellation eligible' : 'Late cancellation (no refund)'}
                  </Text>
                  <Text variant="body.sm" tone="secondary">
                    {isFree
                      ? `You are cancelling over 30 mins before start. Full refund of ${formatNaira(booking.totalKobo)} will be returned.`
                      : 'Cancellations within 30 minutes of booked start time are non-refundable per car park policy.'}
                  </Text>
                </View>
              );
            })()}

            {/* Reason selector */}
            <Text variant="label.sm" tone="secondary">
              Select cancellation reason:
            </Text>
            <View style={{ gap: theme.space.stack.xs }}>
              {CANCEL_REASONS.map((r) => {
                const selected = cancelReason === r.id;
                return (
                  <Pressable
                    key={r.id}
                    onPress={() => setCancelReason(r.id)}
                    style={{
                      minHeight: theme.target.min,
                      justifyContent: 'center',
                      padding: theme.space.inset.sm,
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

            <View style={{ gap: theme.space.stack.xs }}>
              <Button
                label={actionLoading ? 'Cancelling...' : 'Confirm cancellation'}
                variant="danger"
                fullWidth
                loading={actionLoading}
                onPress={handleCancel}
              />
              <Button
                label="Keep booking"
                variant="ghost"
                fullWidth
                onPress={() => setCancelOpen(false)}
              />
            </View>
          </View>
        </View>
      </Modal>

      {/* More actions overflow sheet */}
      <ActionSheet
        visible={moreOpen}
        title="More actions"
        items={moreActions}
        onClose={() => setMoreOpen(false)}
      />
    </Screen>
  );
}
