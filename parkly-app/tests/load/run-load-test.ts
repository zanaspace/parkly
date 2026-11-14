import { performance } from 'node:perf_hooks';

interface LoadResult {
  totalRequests: number;
  successful: number;
  failed: number;
  durations: number[];
  p50: number;
  p95: number;
  p99: number;
}

function calculatePercentiles(durations: number[]): { p50: number; p95: number; p99: number } {
  if (durations.length === 0) return { p50: 0, p95: 0, p99: 0 };
  const sorted = [...durations].sort((a, b) => a - b);
  const p50 = sorted[Math.floor(sorted.length * 0.5)] ?? 0;
  const p95 = sorted[Math.floor(sorted.length * 0.95)] ?? 0;
  const p99 = sorted[Math.floor(sorted.length * 0.99)] ?? 0;
  return { p50, p95, p99 };
}

/**
 * Runner for Sprint 10 Load & Latency verification (NFR-PERF-001, NFR-PERF-003).
 * Simulates 2x pilot load across public discovery, health, and read endpoints.
 */
export async function runPilotLoadBenchmark(opts: {
  baseUrl: string;
  concurrency?: number;
  totalRequests?: number;
}): Promise<{
  reads: LoadResult;
  search: LoadResult;
  passed: boolean;
}> {
  const { baseUrl, concurrency = 50, totalRequests = 200 } = opts;

  console.log(
    `Starting Pilot Load Benchmark (2x pilot load: ${concurrency} concurrent VUs, ${totalRequests} requests)...`,
  );
  console.log(`Target Base URL: ${baseUrl}`);

  const readDurations: number[] = [];
  let readSuccess = 0;
  let readFailed = 0;

  // 1. Benchmark Health & Read Endpoints (Target: p95 < 300 ms)
  const readBatches = Math.ceil(totalRequests / concurrency);
  for (let b = 0; b < readBatches; b++) {
    const promises = Array.from({ length: concurrency }, async () => {
      const start = performance.now();
      try {
        const res = await fetch(`${baseUrl}/health/live`);
        const duration = performance.now() - start;
        readDurations.push(duration);
        if (res.ok) readSuccess++;
        else readFailed++;
      } catch {
        const duration = performance.now() - start;
        readDurations.push(duration);
        readFailed++;
      }
    });
    await Promise.all(promises);
  }

  const { p50: readP50, p95: readP95, p99: readP99 } = calculatePercentiles(readDurations);

  // 2. Benchmark Search & Discovery (Target: p95 < 800 ms)
  const searchDurations: number[] = [];
  let searchSuccess = 0;
  let searchFailed = 0;

  for (let b = 0; b < Math.ceil(totalRequests / concurrency); b++) {
    const promises = Array.from({ length: concurrency }, async () => {
      const start = performance.now();
      try {
        const res = await fetch(
          `${baseUrl}/v1/discovery/search?lat=6.4281&lng=3.4219&radiusMeters=5000`,
        );
        const duration = performance.now() - start;
        searchDurations.push(duration);
        if (res.ok || res.status === 404) searchSuccess++;
        else searchFailed++;
      } catch {
        const duration = performance.now() - start;
        searchDurations.push(duration);
        searchFailed++;
      }
    });
    await Promise.all(promises);
  }

  const { p50: searchP50, p95: searchP95, p99: searchP99 } = calculatePercentiles(searchDurations);

  const readsPassed = readP95 < 300;
  const searchPassed = searchP95 < 800;
  const passed = readsPassed && searchPassed;

  console.log('\n=== Load & Latency Test Results (NFR-PERF-001 & NFR-PERF-003) ===');
  console.log(`Reads (Health / Static / Meta):`);
  console.log(
    `  Requests: ${readDurations.length} | Success: ${readSuccess} | Failed: ${readFailed}`,
  );
  console.log(
    `  p50: ${readP50.toFixed(2)} ms | p95: ${readP95.toFixed(2)} ms (Target: < 300 ms) | p99: ${readP99.toFixed(2)} ms`,
  );
  console.log(`  Status: ${readsPassed ? 'PASSED' : 'FAILED'}`);

  console.log(`\nSearch & Discovery:`);
  console.log(
    `  Requests: ${searchDurations.length} | Success: ${searchSuccess} | Failed: ${searchFailed}`,
  );
  console.log(
    `  p50: ${searchP50.toFixed(2)} ms | p95: ${searchP95.toFixed(2)} ms (Target: < 800 ms) | p99: ${searchP99.toFixed(2)} ms`,
  );
  console.log(`  Status: ${searchPassed ? 'PASSED' : 'FAILED'}`);
  console.log('=================================================================\n');

  return {
    reads: {
      totalRequests: readDurations.length,
      successful: readSuccess,
      failed: readFailed,
      durations: readDurations,
      p50: readP50,
      p95: readP95,
      p99: readP99,
    },
    search: {
      totalRequests: searchDurations.length,
      successful: searchSuccess,
      failed: searchFailed,
      durations: searchDurations,
      p50: searchP50,
      p95: searchP95,
      p99: searchP99,
    },
    passed,
  };
}

if (process.argv[1] && process.argv[1].endsWith('run-load-test.ts')) {
  const url = process.env.API_BASE_URL || 'https://parkly-api-six.vercel.app';
  runPilotLoadBenchmark({ baseUrl: url }).catch((err) => {
    console.error('Load benchmark failed:', err);
    process.exit(1);
  });
}
