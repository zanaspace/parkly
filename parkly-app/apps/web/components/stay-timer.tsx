'use client';

import type { Booking } from '@parkly/contracts';
import { clockLabel, durationLabel, stayTimer } from '@parkly/domain/booking';
import { formatNaira } from '@parkly/domain/money';
import { Text } from '@parkly/ui';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

const REFRESH_MS = 30_000;
const lagosTime = (iso: string) =>
  new Date(Date.parse(iso) + 60 * 60_000).toISOString().slice(11, 16);

/**
 * The driver's timer on the web (ADR 0016). Ticks every second; every 30 s
 * it reloads the booking so check-in, check-out and the server's overstay
 * figure show up.
 */
export function StayTimer({ booking }: { booking: Booking }) {
  const router = useRouter();
  const [now, setNow] = useState(() => new Date());
  const waiting =
    booking.status === 'CONFIRMED' ||
    booking.status === 'CHECKED_IN' ||
    booking.status === 'NO_SHOW';
  const running = !!booking.stay?.checkedInAt && !booking.stay.checkedOutAt;

  useEffect(() => {
    const tick = running ? setInterval(() => setNow(new Date()), 1000) : undefined;
    const refresh = waiting ? setInterval(() => router.refresh(), REFRESH_MS) : undefined;
    return () => {
      if (tick) clearInterval(tick);
      if (refresh) clearInterval(refresh);
    };
  }, [running, waiting, router]);

  const t = stayTimer({
    now,
    endAt: new Date(booking.endAt),
    graceMin: booking.overstay?.graceMin ?? 10,
    stay: booking.stay,
  });
  if (t.phase === 'NOT_IN') return null;
  const since = booking.stay?.checkedInAt ? lagosTime(booking.stay.checkedInAt) : '';
  const overstay = booking.stay?.overstayKobo ?? 0;

  if (t.phase === 'DONE')
    return (
      <section className="pk-card pk-stack pk-ticket" aria-label="Your stay">
        <Text tone="secondary">You parked for</Text>
        <p className="pk-ticket__code">{durationLabel(t.parkedMs)}</p>
        <Text variant="body-sm" tone="secondary">
          {since}–{booking.stay?.checkedOutAt ? lagosTime(booking.stay.checkedOutAt) : ''}
        </Text>
        {overstay > 0 && (
          <p className="pk-notice pk-notice--error">
            Overstay {booking.stay?.overstayMinutes} min: {formatNaira(overstay)} to pay.
          </p>
        )}
      </section>
    );

  return (
    <section className="pk-card pk-stack pk-ticket" aria-label="Your stay" aria-live="polite">
      <Text tone="secondary">
        Parked since {since} · {durationLabel(t.parkedMs)}
      </Text>
      {t.phase === 'PARKED' && (
        <>
          <p className="pk-ticket__code">{clockLabel(t.leftMs)}</p>
          <Text tone="secondary">left · ends {lagosTime(booking.endAt)}</Text>
        </>
      )}
      {t.phase === 'GRACE' && (
        <>
          <p className="pk-ticket__code">{clockLabel(t.graceLeftMs)}</p>
          <p className="pk-notice pk-notice--info">
            Your time is up. Leave now, or overstay is charged when this runs out.
          </p>
        </>
      )}
      {t.phase === 'OVERSTAY' && (
        <>
          <p className="pk-ticket__code">+{clockLabel(t.overMs)}</p>
          <p className="pk-notice pk-notice--error">
            Overstay so far: {formatNaira(overstay)}
            {booking.overstay ? ` (${formatNaira(booking.overstay.per15Kobo)} per 15 min)` : ''}. It
            is added when you check out.
          </p>
        </>
      )}
    </section>
  );
}
