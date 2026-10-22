/**
 * Demo car parks for dev and local (doc 20 S3 task 7; doc 00 Q1: the pilot
 * node and the map's default centre are Victoria Island). Names use street
 * names, never real businesses, and every operator is marked "(demo)".
 */

export type DemoLot = {
  slug: string;
  name: string;
  area: 'Victoria Island' | 'Ikoyi' | 'Lekki Phase 1';
  addressLine: string;
  lat: number;
  lng: number;
  type: 'HOTEL' | 'OFFICE' | 'COMMERCIAL_LOT' | 'EVENT_CENTRE';
  capacityTotal: number;
  capacityBookable: number;
  amenities: string[];
  entranceNotes: string;
  hourlyKobo: number | null;
  dailyKobo: number | null;
  monthlyKobo: number | null;
  /** Weekdays only 07:00–21:00, every day 06:00–23:00, or 24 hours every day. */
  hours: 'weekdays' | 'daily' | '24h';
};

export const DEMO_MARK = '(demo)';
export const DEMO_SLUG_PREFIX = 'demo-';

const lot = (l: Omit<DemoLot, 'slug'> & { key: string }): DemoLot => {
  const { key, ...rest } = l;
  return { slug: `${DEMO_SLUG_PREFIX}${key}`, ...rest };
};

export const DEMO_LOTS: DemoLot[] = [
  lot({
    key: 'adeola-odeku',
    name: 'Adeola Odeku Car Park',
    area: 'Victoria Island',
    addressLine: 'Adeola Odeku Street, Victoria Island',
    lat: 6.4297,
    lng: 3.4214,
    type: 'COMMERCIAL_LOT',
    capacityTotal: 120,
    capacityBookable: 60,
    amenities: ['GUARD', 'CCTV', 'LIGHTING'],
    entranceNotes: 'Enter from Adeola Odeku, beside the bank.',
    hourlyKobo: 50_000,
    dailyKobo: 400_000,
    monthlyKobo: 4_500_000,
    hours: 'daily',
  }),
  lot({
    key: 'ozumba-mbadiwe',
    name: 'Ozumba Mbadiwe Parking',
    area: 'Victoria Island',
    addressLine: 'Ozumba Mbadiwe Avenue, Victoria Island',
    lat: 6.4362,
    lng: 3.4186,
    type: 'COMMERCIAL_LOT',
    capacityTotal: 200,
    capacityBookable: 120,
    amenities: ['GUARD', 'CCTV', 'LIGHTING', 'ACCESS_CONTROL'],
    entranceNotes: 'Barrier gate on the service lane.',
    hourlyKobo: 70_000,
    dailyKobo: 500_000,
    monthlyKobo: null,
    hours: '24h',
  }),
  lot({
    key: 'akin-adesola',
    name: 'Akin Adesola Garage',
    area: 'Victoria Island',
    addressLine: 'Akin Adesola Street, Victoria Island',
    lat: 6.4318,
    lng: 3.4245,
    type: 'OFFICE',
    capacityTotal: 80,
    capacityBookable: 30,
    amenities: ['GUARD', 'COVERED', 'LIGHTING'],
    entranceNotes: 'Basement entrance, show the QR to the guard.',
    hourlyKobo: 60_000,
    dailyKobo: null,
    monthlyKobo: 5_000_000,
    hours: 'weekdays',
  }),
  lot({
    key: 'bishop-aboyade-cole',
    name: 'Bishop Aboyade Cole Lot',
    area: 'Victoria Island',
    addressLine: 'Bishop Aboyade Cole Street, Victoria Island',
    lat: 6.4275,
    lng: 3.4262,
    type: 'COMMERCIAL_LOT',
    capacityTotal: 45,
    capacityBookable: 25,
    amenities: ['GUARD'],
    entranceNotes: 'Open yard behind the pharmacy.',
    hourlyKobo: 30_000,
    dailyKobo: 250_000,
    monthlyKobo: null,
    hours: 'daily',
  }),
  lot({
    key: 'tiamiyu-savage',
    name: 'Tiamiyu Savage Car Park',
    area: 'Victoria Island',
    addressLine: 'Tiamiyu Savage Street, Victoria Island',
    lat: 6.4292,
    lng: 3.4161,
    type: 'HOTEL',
    capacityTotal: 150,
    capacityBookable: 50,
    amenities: ['GUARD', 'CCTV', 'LIGHTING', 'TOILET'],
    entranceNotes: 'Hotel car park, keep left for Parkly bays.',
    hourlyKobo: 80_000,
    dailyKobo: 600_000,
    monthlyKobo: null,
    hours: '24h',
  }),
  lot({
    key: 'karimu-kotun',
    name: 'Karimu Kotun Lot',
    area: 'Victoria Island',
    addressLine: 'Karimu Kotun Street, Victoria Island',
    lat: 6.4268,
    lng: 3.4196,
    type: 'COMMERCIAL_LOT',
    capacityTotal: 60,
    capacityBookable: 40,
    amenities: ['GUARD', 'LIGHTING'],
    entranceNotes: 'Gate opposite the plaza.',
    hourlyKobo: 40_000,
    dailyKobo: 300_000,
    monthlyKobo: 3_500_000,
    hours: 'daily',
  }),
  lot({
    key: 'ahmadu-bello-way',
    name: 'Ahmadu Bello Way Car Park',
    area: 'Victoria Island',
    addressLine: 'Ahmadu Bello Way, Victoria Island',
    lat: 6.4245,
    lng: 3.4105,
    type: 'EVENT_CENTRE',
    capacityTotal: 400,
    capacityBookable: 200,
    amenities: ['GUARD', 'CCTV', 'LIGHTING', 'TOILET'],
    entranceNotes: 'Use Gate 2 on event days.',
    hourlyKobo: 50_000,
    dailyKobo: 350_000,
    monthlyKobo: null,
    hours: 'daily',
  }),
  lot({
    key: 'kofo-abayomi',
    name: 'Kofo Abayomi Parking',
    area: 'Victoria Island',
    addressLine: 'Kofo Abayomi Street, Victoria Island',
    lat: 6.4335,
    lng: 3.4098,
    type: 'OFFICE',
    capacityTotal: 70,
    capacityBookable: 20,
    amenities: ['GUARD', 'CCTV', 'COVERED', 'ACCESS_CONTROL'],
    entranceNotes: 'Ramp down on the right after the security post.',
    hourlyKobo: 90_000,
    dailyKobo: 700_000,
    monthlyKobo: 6_000_000,
    hours: 'weekdays',
  }),
  lot({
    key: 'falomo',
    name: 'Falomo Car Park',
    area: 'Ikoyi',
    addressLine: 'Awolowo Road, Falomo, Ikoyi',
    lat: 6.4413,
    lng: 3.4319,
    type: 'COMMERCIAL_LOT',
    capacityTotal: 180,
    capacityBookable: 100,
    amenities: ['GUARD', 'CCTV', 'LIGHTING'],
    entranceNotes: 'Enter from the roundabout side.',
    hourlyKobo: 50_000,
    dailyKobo: 400_000,
    monthlyKobo: 4_500_000,
    hours: 'daily',
  }),
  lot({
    key: 'awolowo-road',
    name: 'Awolowo Road Car Park',
    area: 'Ikoyi',
    addressLine: 'Awolowo Road, Ikoyi',
    lat: 6.4475,
    lng: 3.4348,
    type: 'COMMERCIAL_LOT',
    capacityTotal: 90,
    capacityBookable: 45,
    amenities: ['GUARD', 'LIGHTING'],
    entranceNotes: 'Behind the shopping arcade.',
    hourlyKobo: 45_000,
    dailyKobo: 300_000,
    monthlyKobo: null,
    hours: 'daily',
  }),
  lot({
    key: 'admiralty-way',
    name: 'Admiralty Way Car Park',
    area: 'Lekki Phase 1',
    addressLine: 'Admiralty Way, Lekki Phase 1',
    lat: 6.4448,
    lng: 3.4718,
    type: 'COMMERCIAL_LOT',
    capacityTotal: 140,
    capacityBookable: 80,
    amenities: ['GUARD', 'CCTV', 'LIGHTING', 'EV'],
    entranceNotes: 'Second entrance after the filling station.',
    hourlyKobo: 40_000,
    dailyKobo: 300_000,
    monthlyKobo: 3_500_000,
    hours: '24h',
  }),
  lot({
    key: 'freedom-way',
    name: 'Freedom Way Parking',
    area: 'Lekki Phase 1',
    addressLine: 'Freedom Way, Lekki Phase 1',
    lat: 6.4412,
    lng: 3.4655,
    type: 'COMMERCIAL_LOT',
    capacityTotal: 50,
    capacityBookable: 30,
    amenities: ['GUARD'],
    entranceNotes: 'Open lot next to the park entrance.',
    hourlyKobo: 30_000,
    dailyKobo: 200_000,
    monthlyKobo: null,
    hours: 'daily',
  }),
];

/** Opening hours in the shape the lots store expects. */
export function hoursFor(kind: DemoLot['hours']) {
  const days = kind === 'weekdays' ? [1, 2, 3, 4, 5] : [0, 1, 2, 3, 4, 5, 6];
  return days.map((weekday) =>
    kind === '24h'
      ? { weekday, is24h: true, opensAt: null, closesAt: null }
      : {
          weekday,
          is24h: false,
          opensAt: kind === 'weekdays' ? '07:00' : '06:00',
          closesAt: kind === 'weekdays' ? '21:00' : '23:00',
        },
  );
}

/**
 * Synthetic lots for the S3 latency check (doc 20: p95 < 800 ms with 500
 * lots). Spread over Victoria Island, Ikoyi and Lekki on a deterministic grid.
 */
export function perfLots(count: number): DemoLot[] {
  const lots: DemoLot[] = [];
  for (let i = 0; i < count; i++) {
    const base = DEMO_LOTS[i % DEMO_LOTS.length] as DemoLot;
    lots.push({
      ...base,
      slug: `${DEMO_SLUG_PREFIX}perf-${i + 1}`,
      name: `Perf Lot ${i + 1}`,
      lat: 6.42 + ((i * 37) % 300) / 10_000,
      lng: 3.4 + ((i * 53) % 800) / 10_000,
    });
  }
  return lots;
}
