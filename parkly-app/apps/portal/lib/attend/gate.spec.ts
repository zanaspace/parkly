import type { Manifest } from '@parkly/contracts';
import { newLotKeyPair, signQrToken, toBase64Url } from '@parkly/domain/qr';
import { describe, expect, it } from 'vitest';
import {
  checkCode,
  checkPlate,
  checkScan,
  localStatus,
  parkedNow,
  parkedPassesNow,
} from './gate';
import type { QueuedEvent } from './queue';

const LOT = '01a162b3-dcae-740c-a25a-e148a6951c2e';
const START = '2026-10-23T07:00:00.000Z';
const END = '2026-10-23T09:00:00.000Z';
const at = (iso: string) => new Date(iso);

async function setup() {
  const pair = await newLotKeyPair();
  const manifest: Manifest = {
    serverTime: '2026-10-23T06:00:00.000Z',
    lot: { id: LOT, name: 'Eko', capacityBookable: 10 },
    rules: { earlyArrivalMin: 30, noShowGraceMin: 30, overstayGraceMin: 10 },
    keys: [{ kid: 'k1', publicKey: toBase64Url(pair.publicKey), status: 'ACTIVE' }],
    revokedKids: [],
    bookings: [
      {
        id: '01a1647d-297b-7248-a1ac-7f06faee3916',
        code: 'PK-7VBZNQ',
        plateNorm: 'LND123AB',
        startAt: START,
        endAt: END,
        status: 'CONFIRMED',
        checkedInAt: null,
        checkedOutAt: null,
        driverVerified: false,
      },
    ],
    passes: [],
    walkIns: 0,
  };
  const s = Date.parse(START) / 1000;
  const e = Date.parse(END) / 1000;
  const ticket = (bookingId: string, lotId = LOT, plate = 'LND123AB') =>
    signQrToken(
      {
        b: bookingId,
        t: 'B',
        l: lotId,
        p: plate,
        s,
        e,
        c: 'PK-7VBZNQ',
        i: s - 3600,
        x: e + 86_400,
      },
      { kid: 'k1', secretKey: pair.secretKey },
    );
  return { manifest, ticket };
}

const bookingId = '01a1647d-297b-7248-a1ac-7f06faee3916';

describe('scan at the gate (doc 03 §3.3)', () => {
  it('is green for a valid ticket in its window', async () => {
    const { manifest, ticket } = await setup();
    const r = await checkScan(await ticket(bookingId), manifest, [], at('2026-10-23T07:05:00Z'));
    expect(r).toMatchObject({ colour: 'GREEN', reason: 'OK', bookingId, plate: 'LND123AB' });
  });

  it('is red for a QR that is not ours, edited, or for another lot', async () => {
    const { manifest, ticket } = await setup();
    const now = at('2026-10-23T07:05:00Z');
    expect(await checkScan('https://example.com', manifest, [], now)).toMatchObject({
      colour: 'RED',
      reason: 'INVALID',
    });
    const good = await ticket(bookingId);
    const edited = good.slice(0, -4) + 'AAAA';
    expect(await checkScan(edited, manifest, [], now)).toMatchObject({ reason: 'INVALID' });
    expect(await checkScan(await ticket(bookingId, 'other-lot'), manifest, [], now)).toMatchObject({
      colour: 'RED',
      reason: 'WRONG_LOT',
    });
  });

  it('accepts a valid ticket the manifest does not have yet, as provisional', async () => {
    const { manifest, ticket } = await setup();
    const fresh = '01a1647d-0000-7000-8000-00000000abcd';
    const r = await checkScan(
      await ticket(fresh, LOT, 'KJA456CD'),
      manifest,
      [],
      at('2026-10-23T07:05:00Z'),
    );
    expect(r).toMatchObject({
      colour: 'AMBER',
      reason: 'PROVISIONAL',
      bookingId: fresh,
      plate: 'KJA456CD',
    });
  });

  it('remembers check-ins this phone has not synced yet', async () => {
    const { manifest, ticket } = await setup();
    const queued: QueuedEvent[] = [
      {
        type: 'CHECK_IN',
        clientEventId: 'e1',
        deviceTime: '2026-10-23T07:01:00.000Z',
        bookingId,
        method: 'QR',
      },
    ];
    const r = await checkScan(
      await ticket(bookingId),
      manifest,
      queued,
      at('2026-10-23T07:05:00Z'),
    );
    expect(r).toMatchObject({ colour: 'AMBER', reason: 'ALREADY_IN' });
  });
});

describe('manual lookup (doc 03 §3.4)', () => {
  it('finds a booking by code or by plate, typos included', async () => {
    const { manifest } = await setup();
    const now = at('2026-10-23T07:05:00Z');
    expect(checkCode('pk-7vbznq', manifest, [], now)).toMatchObject({ colour: 'GREEN', bookingId });
    expect(checkCode('PK-XXXXXX', manifest, [], now)).toMatchObject({
      colour: 'RED',
      reason: 'NOT_FOUND',
    });
    expect(checkPlate('LND 123 AB', manifest, [], now)).toEqual([
      expect.objectContaining({ colour: 'GREEN', bookingId }),
    ]);
    expect(checkPlate('LND123A8', manifest, [], now)).toHaveLength(1);
    expect(checkPlate('ABC111XY', manifest, [], now)).toEqual([]);
  });
});

describe('who is parked (A-05)', () => {
  it('combines the manifest with this phone’s queued check-ins and check-outs', async () => {
    const { manifest } = await setup();
    const queued: QueuedEvent[] = [
      { type: 'CHECK_IN', clientEventId: 'a', deviceTime: START, bookingId, method: 'QR' },
    ];
    expect(parkedNow(manifest, queued).map((b) => b.id)).toEqual([bookingId]);
    expect(localStatus(bookingId, queued)).toEqual({ checkedInAt: at(START), checkedOutAt: null });
    queued.push({
      type: 'CHECK_OUT',
      clientEventId: 'b',
      deviceTime: END,
      bookingId,
      method: 'QR',
    });
    expect(parkedNow(manifest, queued)).toEqual([]);
  });
});

describe('monthly pass at the gate (FR-PASS-002, FR-PASS-005)', () => {
  it('verifies a monthly pass QR, blocks second check-in until check-out, and rejects old plate after swap', async () => {
    const pair = await newLotKeyPair();
    const passId = '01a1647d-297b-7248-a1ac-000000009999';
    const manifest: Manifest = {
      serverTime: '2026-10-23T06:00:00.000Z',
      lot: { id: LOT, name: 'Eko', capacityBookable: 10 },
      rules: { earlyArrivalMin: 30, noShowGraceMin: 30, overstayGraceMin: 10 },
      keys: [{ kid: 'k1', publicKey: toBase64Url(pair.publicKey), status: 'ACTIVE' }],
      revokedKids: [],
      bookings: [],
      passes: [
        {
          id: passId,
          code: 'MP-8K3XZP',
          plateNorm: 'EKY999ZZ',
          periodStart: '2026-10-01',
          periodEnd: '2026-10-31',
          status: 'ACTIVE',
          inLot: false,
          checkedInAt: null,
          driverVerified: true,
        },
      ],
      walkIns: 0,
    };
    const s = Math.floor(Date.parse('2026-10-01T00:00:00.000Z') / 1000);
    const e = Math.floor(Date.parse('2026-10-31T00:00:00.000Z') / 1000);
    const passToken = await signQrToken(
      {
        b: passId,
        t: 'P',
        l: LOT,
        p: 'EKY999ZZ',
        s,
        e,
        c: 'MP-8K3XZP',
        i: s,
        x: e + 86_400,
      },
      { kid: 'k1', secretKey: pair.secretKey },
    );

    const now = at('2026-10-23T07:05:00Z');
    const r1 = await checkScan(passToken, manifest, [], now);
    expect(r1).toMatchObject({
      colour: 'GREEN',
      reason: 'OK',
      passId,
      isPass: true,
      driverVerified: true,
      plate: 'EKY999ZZ',
    });

    // Check by code and plate
    expect(checkCode('mp-8k3xzp', manifest, [], now)).toMatchObject({
      colour: 'GREEN',
      passId,
      isPass: true,
    });
    expect(checkPlate('EKY 999 ZZ', manifest, [], now)).toHaveLength(1);

    // Local check-in queues passId
    const queued: QueuedEvent[] = [
      {
        type: 'CHECK_IN',
        clientEventId: 'p1',
        deviceTime: '2026-10-23T07:06:00.000Z',
        passId,
        method: 'QR',
      },
    ];
    expect(parkedPassesNow(manifest, queued).map((p) => p.id)).toEqual([passId]);

    const r2 = await checkScan(passToken, manifest, queued, now);
    expect(r2).toMatchObject({ colour: 'AMBER', reason: 'ALREADY_IN', passId, isPass: true });

    // Old QR after vehicle swap to a new plate in manifest -> INVALID
    const firstPass = manifest.passes?.[0];
    if (firstPass) firstPass.plateNorm = 'LAG777AA';
    const rSwapped = await checkScan(passToken, manifest, [], now);
    expect(rSwapped).toMatchObject({ colour: 'RED', reason: 'INVALID' });
  });
});

