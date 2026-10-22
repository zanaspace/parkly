import type { Booking } from '@parkly/contracts';
import { clockLabel, durationLabel, stayTimer } from '@parkly/domain/booking';
import { formatNaira } from '@parkly/domain/money';
import { Text, useTheme } from '@parkly/ui-native';
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { Notice } from './Notice';

const lagosTime = (iso: string) =>
  new Date(Date.parse(iso) + 60 * 60_000).toISOString().slice(11, 16);

/**
 * D-18 the driver's timer (ADR 0016): counts down to the end, then the grace,
 * then the overstay; stops at check-out with the total. Ticks every second;
 * the overstay amount is the server's (refreshed by the booking screen).
 */
export function StayTimer({ booking }: { booking: Booking }) {
  const theme = useTheme();
  const [now, setNow] = useState(() => new Date());
  const running = !!booking.stay?.checkedInAt && !booking.stay.checkedOutAt;
  useEffect(() => {
    if (!running) return;
    const tick = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(tick);
  }, [running]);

  const t = stayTimer({
    now,
    endAt: new Date(booking.endAt),
    graceMin: booking.overstay?.graceMin ?? 10,
    stay: booking.stay,
  });
  if (t.phase === 'NOT_IN') return null;

  const card = {
    gap: theme.space.stack.xs,
    padding: theme.card.padding,
    borderRadius: theme.card.radius,
    borderWidth: 1,
    borderColor: theme.card.border,
    backgroundColor: theme.card.bg,
    alignItems: 'center' as const,
  };
  const since = booking.stay?.checkedInAt ? lagosTime(booking.stay.checkedInAt) : '';
  const overstay = booking.stay?.overstayKobo ?? 0;

  if (t.phase === 'DONE')
    return (
      <View style={card} accessibilityRole="summary">
        <Text tone="secondary">You parked for</Text>
        <Text variant="heading.xl">{durationLabel(t.parkedMs)}</Text>
        <Text variant="body.sm" tone="secondary">
          {since}–{booking.stay?.checkedOutAt ? lagosTime(booking.stay.checkedOutAt) : ''}
        </Text>
        {overstay > 0 ? (
          <Notice
            kind="warning"
            message={`Overstay ${booking.stay?.overstayMinutes ?? 0} min: ${formatNaira(overstay)} to pay.`}
          />
        ) : null}
      </View>
    );

  return (
    <View style={card} accessibilityRole="timer" accessibilityLiveRegion="polite">
      <Text tone="secondary">
        Parked since {since} · {durationLabel(t.parkedMs)}
      </Text>
      {t.phase === 'PARKED' ? (
        <>
          <Text variant="heading.xl">{clockLabel(t.leftMs)}</Text>
          <Text tone="secondary">left · ends {lagosTime(booking.endAt)}</Text>
        </>
      ) : null}
      {t.phase === 'GRACE' ? (
        <>
          <Text variant="heading.xl">{clockLabel(t.graceLeftMs)}</Text>
          <Notice
            kind="warning"
            message="Your time is up. Leave now, or overstay is charged when this runs out."
          />
        </>
      ) : null}
      {t.phase === 'OVERSTAY' ? (
        <>
          <Text variant="heading.xl">+{clockLabel(t.overMs)}</Text>
          <Notice
            kind="danger"
            message={`Overstay so far: ${formatNaira(overstay)}${
              booking.overstay ? ` (${formatNaira(booking.overstay.per15Kobo)} per 15 min)` : ''
            }. It is added when you check out.`}
          />
        </>
      ) : null}
    </View>
  );
}
