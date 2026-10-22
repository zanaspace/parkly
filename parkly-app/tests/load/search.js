// k6 load test for driver search (doc 02 §12.9; doc 20 S3 exit criterion).
// Seed first: pnpm --filter @parkly/api seed:demo -- --confirm-dev --perf 500
// Run:        k6 run -e API=https://parkly-api-six.vercel.app tests/load/search.js
// Not a pass for dev Hobby hosting limits; run against staging before launch (S10).
import http from 'k6/http';
import { check } from 'k6';

export const options = {
  stages: [
    { duration: '2m', target: 100 },
    { duration: '6m', target: 100 },
    { duration: '2m', target: 0 },
  ],
  thresholds: {
    http_req_duration: ['p(95)<500'],
    http_req_failed: ['rate<0.005'],
  },
};

// Victoria Island, Ikoyi, Lekki Phase 1 and Ikeja (doc 02 §12.9: mixed VI/Ikeja).
const POINTS = [
  [6.4281, 3.4219],
  [6.4475, 3.4348],
  [6.4448, 3.4718],
  [6.6018, 3.3515],
];

/** Tomorrow 08:00–18:00 Lagos (07:00–17:00 UTC), on the 15-minute grid. */
function window() {
  const d = new Date(Date.now() + 24 * 60 * 60 * 1000);
  const day = d.toISOString().slice(0, 10);
  return { startAt: `${day}T07:00:00Z`, endAt: `${day}T17:00:00Z` };
}

export default function () {
  const [lat, lng] = POINTS[Math.floor(Math.random() * POINTS.length)];
  const { startAt, endAt } = window();
  const res = http.get(
    `${__ENV.API}/v1/lots/search?lat=${lat}&lng=${lng}&radiusM=2000&startAt=${startAt}&endAt=${endAt}`,
    { tags: { name: 'search' } },
  );
  check(res, { 'status 200': (r) => r.status === 200 });
}
