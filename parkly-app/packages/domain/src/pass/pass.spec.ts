import { describe, expect, it } from 'vitest';

import {
  checkPassCapacity,
  checkPassCheckIn,
  checkPassVehicleSwap,
  passPeriod,
  passRenewalReminderDue,
} from './pass.js';

describe('passPeriod', () => {
  it('computes a 30-day inclusive window in Africa/Lagos', () => {
    const p = passPeriod('2026-04-01');
    expect(p).toEqual({
      periodStart: '2026-04-01',
      periodEnd: '2026-04-30',
      startsAt: '2026-03-31T23:00:00.000Z',
      endsAt: '2026-04-30T23:00:00.000Z',
    });
  });

  it('throws on invalid date format', () => {
    expect(() => passPeriod('04/01/2026')).toThrow(/Invalid pass startDate/);
    expect(() => passPeriod('2026-99-99')).toThrow(/Invalid pass startDate/);
  });
});

describe('checkPassCapacity', () => {
  it('enforces default 50% share cap and physical slot availability', () => {
    expect(
      checkPassCapacity({
        capacityBookable: 20,
        overlappingPasses: 9,
        maxSlotCommitted: 12,
      }),
    ).toEqual({
      ok: true,
      maxPassesAllowed: 10,
      remainingPassSlots: 1,
    });

    expect(
      checkPassCapacity({
        capacityBookable: 20,
        overlappingPasses: 10,
        maxSlotCommitted: 10,
      }),
    ).toEqual({
      ok: false,
      reason: 'PASS_CAPACITY_UNAVAILABLE',
      maxPassesAllowed: 10,
      remainingPassSlots: 0,
    });
  });

  it('rejects when physical slot inventory in the window is fully committed', () => {
    expect(
      checkPassCapacity({
        capacityBookable: 10,
        maxSharePercent: 50,
        overlappingPasses: 2,
        maxSlotCommitted: 10,
      }),
    ).toEqual({
      ok: false,
      reason: 'PASS_CAPACITY_UNAVAILABLE',
      maxPassesAllowed: 5,
      remainingPassSlots: 0,
    });
  });

  it('rejects when capacityBookable is 0', () => {
    expect(
      checkPassCapacity({
        capacityBookable: 0,
        overlappingPasses: 0,
      }),
    ).toEqual({
      ok: false,
      reason: 'PASS_CAPACITY_UNAVAILABLE',
      maxPassesAllowed: 0,
      remainingPassSlots: 0,
    });
  });
});

describe('checkPassCheckIn', () => {
  const base = {
    status: 'ACTIVE' as const,
    periodStart: '2026-04-01',
    periodEnd: '2026-04-30',
    todayLagos: '2026-04-15',
    hasOpenSession: false,
    isLotOpen: true,
  };

  it('allows check-in when active, within window, and no open session', () => {
    expect(checkPassCheckIn(base)).toEqual({ ok: true });
  });

  it('blocks second concurrent check-in (one vehicle in lot at a time)', () => {
    expect(checkPassCheckIn({ ...base, hasOpenSession: true })).toEqual({
      ok: false,
      reason: 'ALREADY_CHECKED_IN',
    });
  });

  it('blocks check-in when lot is closed, pass inactive, or outside window', () => {
    expect(checkPassCheckIn({ ...base, isLotOpen: false })).toEqual({
      ok: false,
      reason: 'LOT_CLOSED',
    });
    expect(checkPassCheckIn({ ...base, status: 'HELD' })).toEqual({
      ok: false,
      reason: 'PASS_NOT_ACTIVE',
    });
    expect(checkPassCheckIn({ ...base, todayLagos: '2026-05-01' })).toEqual({
      ok: false,
      reason: 'OUTSIDE_WINDOW',
    });
  });
});

describe('checkPassVehicleSwap', () => {
  const base = {
    status: 'ACTIVE' as const,
    periodEnd: '2026-04-30',
    todayLagos: '2026-04-10',
    swapsUsed: 0,
    hasOpenSession: false,
    currentVehicleId: 'veh-1',
    newVehicleId: 'veh-2',
  };

  it('allows up to 2 swaps per month and tracks remaining count', () => {
    expect(checkPassVehicleSwap(base)).toEqual({
      ok: true,
      swapsUsedAfter: 1,
      swapsRemainingAfter: 1,
    });
    expect(checkPassVehicleSwap({ ...base, swapsUsed: 1 })).toEqual({
      ok: true,
      swapsUsedAfter: 2,
      swapsRemainingAfter: 0,
    });
    expect(checkPassVehicleSwap({ ...base, swapsUsed: 2 })).toEqual({
      ok: false,
      reason: 'PASS_SWAP_LIMIT_REACHED',
    });
  });

  it('rejects swap while vehicle is checked in, pass inactive, or same vehicle', () => {
    expect(checkPassVehicleSwap({ ...base, hasOpenSession: true })).toEqual({
      ok: false,
      reason: 'VEHICLE_IN_USE',
    });
    expect(checkPassVehicleSwap({ ...base, status: 'EXPIRED' })).toEqual({
      ok: false,
      reason: 'PASS_NOT_ACTIVE',
    });
    expect(checkPassVehicleSwap({ ...base, newVehicleId: 'veh-1' })).toEqual({
      ok: false,
      reason: 'SAME_VEHICLE',
    });
  });
});

describe('passRenewalReminderDue', () => {
  it('fires at 7 days and 2 days before periodEnd without duplicating', () => {
    expect(
      passRenewalReminderDue({
        status: 'ACTIVE',
        periodEnd: '2026-04-30',
        todayLagos: '2026-04-23',
        lastReminderDays: null,
      }),
    ).toBe(7);

    expect(
      passRenewalReminderDue({
        status: 'ACTIVE',
        periodEnd: '2026-04-30',
        todayLagos: '2026-04-23',
        lastReminderDays: 7,
      }),
    ).toBeNull();

    expect(
      passRenewalReminderDue({
        status: 'ACTIVE',
        periodEnd: '2026-04-30',
        todayLagos: '2026-04-28',
        lastReminderDays: 7,
      }),
    ).toBe(2);

    expect(
      passRenewalReminderDue({
        status: 'ACTIVE',
        periodEnd: '2026-04-30',
        todayLagos: '2026-04-28',
        lastReminderDays: 2,
      }),
    ).toBeNull();

    expect(
      passRenewalReminderDue({
        status: 'EXPIRED',
        periodEnd: '2026-04-30',
        todayLagos: '2026-04-28',
        lastReminderDays: null,
      }),
    ).toBeNull();
  });
});
