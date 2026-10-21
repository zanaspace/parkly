import { describe, expect, it } from 'vitest';
import { createLogger } from '../lib/logger.js';
import { FakeEmailProvider } from '../providers/fakes.js';
import { logOnlyEmail } from '../providers/log-email.js';
import { MemoryStore } from '../store/memory.js';
import { createJobs } from './registry.js';

describe('job registry', () => {
  it('registers the ping and permit expiry jobs', async () => {
    const jobs = createJobs({
      store: new MemoryStore(),
      email: new FakeEmailProvider(),
      logger: createLogger({ level: 'silent' }),
      now: () => new Date('2026-10-19T05:00:00Z'),
      appEnv: 'prod',
    });
    expect(Object.keys(jobs).sort()).toEqual(['permit-expiry-check', 'ping']);
    const deadline = new Date('2100-01-01T00:00:00Z');
    expect(await jobs['permit-expiry-check']?.({ payload: {}, deadline })).toEqual({
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
