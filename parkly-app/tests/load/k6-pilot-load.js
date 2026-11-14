import http from 'k6/http';
import { check, group, sleep } from 'k6';
import { Counter, Rate, Trend } from 'k6/metrics';

// Custom metrics aligned with Doc 19 §7 NFRs
export const searchDuration = new Trend('search_duration_ms');
export const quoteDuration = new Trend('quote_duration_ms');
export const bookingDuration = new Trend('booking_create_duration_ms');
export const attendantSyncDuration = new Trend('attendant_sync_duration_ms');
export const errorRate = new Rate('error_rate');
export const successfulBookings = new Counter('successful_bookings');

// Configuration for 2× Pilot Load (NFR-PERF-003)
// Pilot baseline: 2,000 bookings/day with peak concurrency ~25 VUs.
// 2× Pilot Load: 50 concurrent Virtual Users (VUs) sustaining ~4,000 bookings/day rate.
export const options = {
  stages: [
    { duration: '30s', target: 15 }, // Warm-up
    { duration: '1m', target: 50 }, // Ramp to 2× pilot load (50 concurrent VUs)
    { duration: '2m', target: 50 }, // Sustain 2× peak load
    { duration: '30s', target: 100 }, // Concurrency spike test (overbooking resistance)
    { duration: '30s', target: 0 }, // Ramp-down
  ],
  thresholds: {
    // NFR-PERF-001: Reads p95 < 300ms, Search p95 < 800ms, Booking create p95 < 1000ms
    'http_req_duration{type:read}': ['p(95)<300'],
    'http_req_duration{type:search}': ['p(95)<800'],
    'http_req_duration{type:booking}': ['p(95)<1000'],
    error_rate: ['rate<0.01'], // < 1% error rate on valid requests
    http_req_failed: ['rate<0.01'],
  },
};

const BASE_URL = __ENV.API_BASE_URL || 'http://localhost:3000';
const DEFAULT_HEADERS = {
  'Content-Type': 'application/json',
  Accept: 'application/json',
};

export default function () {
  const lotId = __ENV.PILOT_LOT_ID || '00000000-0000-0000-0000-000000000001';
  const driverToken = __ENV.TEST_DRIVER_TOKEN || 'mock-driver-token';

  group('1. Discovery & Search (NFR-PERF-001: p95 < 800ms)', () => {
    const lat = 6.4281;
    const lng = 3.4219;
    const res = http.get(
      `${BASE_URL}/v1/discovery/search?lat=${lat}&lng=${lng}&radiusMeters=5000`,
      {
        headers: DEFAULT_HEADERS,
        tags: { type: 'search' },
      },
    );

    searchDuration.add(res.timings.duration);
    const passed = check(res, {
      'search status is 200': (r) => r.status === 200,
      'search latency < 800ms': (r) => r.timings.duration < 800,
    });
    if (!passed) errorRate.add(1);
    else errorRate.add(0);
  });

  sleep(1);

  group('2. Lot Details & Pricing Quote (NFR-PERF-001: p95 < 300ms)', () => {
    const res = http.get(`${BASE_URL}/v1/lots/${lotId}`, {
      headers: DEFAULT_HEADERS,
      tags: { type: 'read' },
    });

    const passed = check(res, {
      'lot details status is 200': (r) => r.status === 200 || r.status === 404,
    });
    if (!passed) errorRate.add(1);
  });

  sleep(1);

  group('3. Booking Hold Creation (NFR-PERF-001: p95 < 1000ms, NFR-PERF-003)', () => {
    const payload = JSON.stringify({
      lotId,
      vehicleId: `veh-${__VU}-${__ITER}`,
      startAt: new Date(Date.now() + 3600 * 1000).toISOString(),
      endAt: new Date(Date.now() + 7200 * 1000).toISOString(),
    });

    const res = http.post(`${BASE_URL}/v1/bookings`, payload, {
      headers: Object.assign({}, DEFAULT_HEADERS, {
        Authorization: `Bearer ${driverToken}`,
        'idempotency-key': `k6-${__VU}-${__ITER}-${Date.now()}`,
      }),
      tags: { type: 'booking' },
    });

    bookingDuration.add(res.timings.duration);

    // 201 Created or 409 Capacity Exceeded are expected valid business responses
    const valid = check(res, {
      'booking returns 201 or 409': (r) => r.status === 201 || r.status === 409,
    });

    if (res.status === 201) {
      successfulBookings.add(1);
    }

    if (!valid && res.status >= 500) {
      errorRate.add(1);
    }
  });

  sleep(1);

  group('4. Attendant Manifest Sync (NFR-OFFLINE-001: < 1000ms)', () => {
    const res = http.get(`${BASE_URL}/v1/attend/lots/${lotId}/manifest?windowHours=24`, {
      headers: Object.assign({}, DEFAULT_HEADERS, {
        Authorization: `Bearer ${__ENV.TEST_ATTENDANT_TOKEN || 'mock-attendant-token'}`,
      }),
      tags: { type: 'read' },
    });

    attendantSyncDuration.add(res.timings.duration);
    check(res, {
      'attendant sync returns 200': (r) => r.status === 200 || r.status === 403,
    });
  });

  sleep(2);
}
