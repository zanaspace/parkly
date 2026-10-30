import { describe, expect, it } from 'vitest';
import { createLogger } from '../lib/logger.js';
import { testDeps } from '../test-helpers.js';
import { FakeEmailProvider, FakePaymentProvider } from '../providers/fakes.js';
import { logOnlyEmail } from '../providers/log-email.js';
import { MemoryStore } from '../store/memory.js';
import { createJobs } from './registry.js';

describe('job registry', () => {
  it('registers the ping, permit expiry and payment safety-net jobs', async () => {
    const store = new MemoryStore();
    const jobs = createJobs({
      store,
      email: new FakeEmailProvider(),
      payments: new FakePaymentProvider(),
      logger: createLogger({ level: 'silent' }),
      now: () => new Date('2026-10-19T05:00:00Z'),
      appEnv: 'prod',
      notifications: testDeps({ store }).notifications,
    });
    expect(Object.keys(jobs).sort()).toEqual([
      'deliver-notifications',
      'permit-expiry-check',
      'ping',
      'settle-payments',
      'sweep-reminders',
    ]);
    const deadline = new Date('2100-01-01T00:00:00Z');
    expect(await jobs['permit-expiry-check']?.({ payload: {}, deadline })).toEqual({
      processed: 0,
      remaining: 0,
    });
    expect(await jobs['settle-payments']?.({ payload: {}, deadline })).toEqual({
      processed: 0,
      remaining: 0,
    });
    expect(await jobs['sweep-reminders']?.({ payload: {}, deadline })).toEqual({
      processed: 0,
      remaining: 0,
    });
  });

  it('log-only email never logs the address', async () => {
    const lines: string[] = [];
    const logger = createLogger({ level: 'info', stream: { write: (l: string) => lines.push(l) } });
    await logOnlyEmail(logger).send({
      to: 'ops@ekohotel.ng',
      subject: 'Hello',
      text: 'x',
      html: '<p>x</p>',
    });
    expect(lines.join('')).toContain('ekohotel.ng');
    expect(lines.join('')).not.toContain('ops@');
  });
});
