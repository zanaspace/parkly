import { describe, expect, it } from 'vitest';
import { TEST_JOB_SECRET, testApp } from '../test-helpers.js';
import { signJobRequest } from './signature.js';

const nowSec = Date.parse('2026-10-19T08:00:00Z') / 1000;

function jobRequest(job: string, body = '{}', id = 'job-call-1', secret = TEST_JOB_SECRET) {
  return {
    method: 'POST',
    body,
    headers: {
      'content-type': 'application/json',
      'x-parkly-job-id': id,
      'x-parkly-job-timestamp': String(nowSec),
      'x-parkly-job-signature': signJobRequest({ secret, job, timestamp: nowSec, body }),
    },
  };
}

describe('POST /internal/jobs/:job', () => {
  const jobs = { ping: async () => ({ processed: 3, remaining: 0 }) };

  it('runs a registered job and returns 202 with progress', async () => {
    const res = await testApp({ jobs }).request('/internal/jobs/ping', jobRequest('ping'));
    expect(res.status).toBe(202);
    expect(await res.json()).toEqual({ processed: 3, remaining: 0 });
  });

  it('rejects a bad signature with 401 before running anything', async () => {
    let ran = false;
    const app = testApp({
      jobs: { ping: async () => ((ran = true), { processed: 0, remaining: 0 }) },
    });
    const res = await app.request(
      '/internal/jobs/ping',
      jobRequest('ping', '{}', 'id', 'w'.repeat(40)),
    );
    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({ code: 'WEBHOOK_SIGNATURE_INVALID' });
    expect(ran).toBe(false);
  });

  it('treats a replayed job id as a no-op', async () => {
    const app = testApp({ jobs });
    await app.request('/internal/jobs/ping', jobRequest('ping', '{}', 'same-id'));
    const res = await app.request('/internal/jobs/ping', jobRequest('ping', '{}', 'same-id'));
    expect(res.status).toBe(202);
    expect(await res.json()).toEqual({ processed: 0, remaining: 0, duplicate: true });
  });

  it('returns 404 for an unknown job (after verifying the signature)', async () => {
    const res = await testApp({ jobs }).request('/internal/jobs/nope', jobRequest('nope'));
    expect(res.status).toBe(404);
  });
});
