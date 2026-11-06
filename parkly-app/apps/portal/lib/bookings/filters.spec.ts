import { describe, expect, it } from 'vitest';
import { filterQuery, naira, readFilters, stayLabel, statusLabel, timeLabel } from './filters';

// Friday 2026-11-06 10:00 Lagos.
const NOW = Date.parse('2026-11-06T09:00:00Z');
const LOT = '0195f1a2-0000-7000-8000-000000000001';

describe('booking filters (FR-OPS-002)', () => {
  it('defaults to the last 7 days, all car parks, all statuses', () => {
    expect(readFilters({}, NOW)).toEqual({
      from: '2026-10-31',
      to: '2026-11-06',
      lotId: '',
      status: '',
    });
  });

  it('keeps valid filters and drops malformed ones', () => {
    expect(
      readFilters({ from: '2026-11-01', to: '2026-11-02', lotId: LOT, status: 'CHECKED_IN' }, NOW),
    ).toEqual({ from: '2026-11-01', to: '2026-11-02', lotId: LOT, status: 'CHECKED_IN' });
    expect(
      readFilters({ from: '1/11/2026', to: ['x'], lotId: 'nope', status: 'PARKED' }, NOW),
    ).toEqual({ from: '2026-10-31', to: '2026-11-06', lotId: '', status: '' });
  });

  it('builds a query without empty filters, plus extras', () => {
    expect(filterQuery({ from: '2026-11-01', to: '2026-11-02', lotId: '', status: '' })).toBe(
      'from=2026-11-01&to=2026-11-02',
    );
    expect(
      filterQuery(
        { from: '2026-11-01', to: '2026-11-02', lotId: LOT, status: 'COMPLETED' },
        { cursor: 'abc' },
      ),
    ).toBe(`from=2026-11-01&to=2026-11-02&lotId=${LOT}&status=COMPLETED&cursor=abc`);
  });

  it('formats money, stays and times for Lagos', () => {
    expect(naira(150000)).toBe('₦1,500.00');
    expect(naira(1505)).toBe('₦15.05');
    expect(stayLabel('2026-10-19T09:00:00.000Z', '2026-10-19T11:00:00.000Z')).toBe(
      'Mon 19 Oct, 10:00–12:00',
    );
    expect(stayLabel('2026-10-19T09:00:00.000Z', '2026-10-20T09:00:00.000Z')).toBe(
      'Mon 19 Oct, 10:00–Tue 20 Oct, 10:00',
    );
    expect(timeLabel('2026-10-19T09:05:00.000Z')).toBe('10:05');
    expect(timeLabel(null)).toBe('—');
  });

  it('labels statuses in plain words', () => {
    expect(statusLabel('CHECKED_IN')).toBe('Parked now');
    expect(statusLabel('CONFIRMED')).toBe('Paid, not arrived');
  });
});
