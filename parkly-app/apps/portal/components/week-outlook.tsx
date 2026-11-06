import type { Outlook } from '@parkly/contracts';
import { Text } from '@parkly/ui';
import { dayLabel, freeTone } from '../lib/occupancy/live';

const TONE_BADGE = {
  full: 'pk-badge--rejected',
  busy: 'pk-badge--submitted',
  ok: 'pk-badge--live',
};

type Lot = Outlook['items'][number];
type Day = Lot['days'][number];

function DayCell({ lot, day }: { lot: Lot; day: Day }) {
  return (
    <div style={{ display: 'grid', gap: '0.25rem', justifyItems: 'start' }}>
      <span
        className={`pk-badge ${TONE_BADGE[freeTone(day.minFree, lot.capacityBookable)]}`}
        style={{ textTransform: 'none', fontSize: '0.75rem' }}
      >
        {day.minFree} free
      </span>
      <Text variant="body-sm" tone="secondary">
        {day.arrivals} {day.arrivals === 1 ? 'arrival' : 'arrivals'}
      </Text>
    </div>
  );
}

/**
 * FR-OPS-001: today and the next six days per lot. "Free" is the fewest
 * bookable spaces left at the busiest 15 minutes of that day; today counts
 * from now on. Loaded with the page, not polled.
 */
export function WeekOutlook({ outlook }: { outlook: Outlook['items'] }) {
  if (outlook.length === 0) return null;
  const dates = outlook[0]?.days.map((d) => d.date) ?? [];
  return (
    <div style={{ marginTop: '1.5rem' }}>
      <Text variant="heading-md" as="h2">
        The week ahead
      </Text>
      <Text variant="body-sm" tone="secondary">
        Bookable spaces left at each day’s busiest time, and paid bookings due to arrive.
      </Text>

      <div className="pk-table-desktop" style={{ marginTop: '0.75rem' }}>
        <div className="pk-table-wrap">
          <table className="pk-table">
            <thead>
              <tr>
                <th scope="col">Car park</th>
                {dates.map((d, i) => (
                  <th scope="col" key={d}>
                    {dayLabel(d, i)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {outlook.map((lot) => (
                <tr key={lot.lotId}>
                  <td>
                    <strong style={{ color: 'var(--pk-color-text-primary)' }}>{lot.name}</strong>
                    <Text variant="body-sm" tone="secondary" style={{ display: 'block' }}>
                      {lot.capacityBookable} bookable
                    </Text>
                  </td>
                  {lot.days.map((day) => (
                    <td key={day.date}>
                      <DayCell lot={lot} day={day} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="pk-cards-mobile" style={{ marginTop: '0.75rem' }}>
        {outlook.map((lot) => (
          <div key={lot.lotId} className="pk-card pk-mobile-record-card">
            <strong style={{ fontSize: '1rem', color: 'var(--pk-color-text-primary)' }}>
              {lot.name}
            </strong>
            <ul
              style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: '0.5rem' }}
            >
              {lot.days.map((day, i) => (
                <li
                  key={day.date}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: '0.75rem',
                  }}
                >
                  <Text variant="body-sm">{dayLabel(day.date, i)}</Text>
                  <span style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                    <Text variant="body-sm" tone="secondary">
                      {day.arrivals} arriving
                    </Text>
                    <span
                      className={`pk-badge ${TONE_BADGE[freeTone(day.minFree, lot.capacityBookable)]}`}
                      style={{ textTransform: 'none', fontSize: '0.75rem' }}
                    >
                      {day.minFree} free
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}
