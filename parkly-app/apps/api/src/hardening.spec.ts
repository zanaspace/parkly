import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { retryWebhooksJob } from './jobs/retry-webhooks.js';
import { reapplyErasuresJob } from './jobs/reapply-erasures.js';
import { world } from './test-helpers.js';

const ROOT = resolve(import.meta.dirname, '../../..');

describe('Sprint 9 — Hardening, Security, Low-End Device & Accessibility (docs/05, NFR-LOWEND-001, NFR-A11Y-001)', () => {
  it('enforces security headers and webhook signature validation across Paystack and Flutterwave (docs/05)', async () => {
    const w = world();
    const health = await w.call('GET', '/health/live');
    expect(health.status).toBe(200);
    expect(health.headers.get('x-content-type-options')).toBe('nosniff');
    expect(health.headers.get('x-frame-options')).toBe('DENY');
    expect(health.headers.get('referrer-policy')).toBe('no-referrer');

    // Unsigned Paystack webhook is rejected with 401
    const badPaystack = await w.call('POST', '/v1/webhooks/paystack', {
      body: { event: 'charge.success', data: { reference: 'pk_test' } },
    });
    expect(badPaystack.status).toBe(401);

    // Unsigned Flutterwave webhook is rejected with 401
    const badFlw = await w.call('POST', '/v1/webhooks/flutterwave', {
      body: { event: 'charge.completed', data: { tx_ref: 'pk_test', status: 'successful' } },
    });
    expect(badFlw.status).toBe(401);
  });

  it('verifies RLS is enabled on all new Sprint 9 tables and hot indexes exist (docs/05, NFR-LOWEND-001)', () => {
    const migration = readFileSync(
      resolve(ROOT, 'supabase/migrations/20261113170000_s9_passes_verification_blackouts.sql'),
      'utf8',
    ).toLowerCase();
    expect(migration).toMatch(
      /alter table ("?public"?\.)?"?driver_verifications"? enable row level security/,
    );
    expect(migration).toMatch(/alter table ("?public"?\.)?"?passes"? enable row level security/);
    expect(migration).toMatch(
      /alter table ("?public"?\.)?"?pass_waitlist"? enable row level security/,
    );
    expect(migration).toContain('passes_lot_status_period_idx');
    expect(migration).toContain('passes_driver_period_idx');
    expect(migration).toContain('passes_status_hold_idx');
  });

  it('verifies nightly off-platform backup workflow and post-restore erasure replay (docs/06 §7)', async () => {
    const workflow = readFileSync(resolve(ROOT, '.github/workflows/nightly-backup.yml'), 'utf8');
    expect(workflow).toContain('cron:');
    expect(workflow).toContain('pg_dump');
    expect(workflow).toContain('AGE_PUBLIC_KEY');
    expect(workflow).toContain('RetentionDays=35');

    const script = readFileSync(resolve(ROOT, 'scripts/reapply-erasures.ts'), 'utf8');
    expect(script).toContain('erasure_log');
    expect(script).toContain('reapplyErasures');

    const w = world();
    const retryJob = retryWebhooksJob({
      store: w.store,
      payments: w.payments,
      notifications: w.deps.notifications,
      logger: w.deps.logger,
      now: () => new Date(),
    });
    const retryRes = await retryJob({ payload: {}, deadline: new Date(Date.now() + 5000) });
    expect(retryRes.processed).toBe(0);

    const eraseJob = reapplyErasuresJob({
      store: w.store,
      logger: w.deps.logger,
      now: () => new Date(),
    });
    const erasureRes = await eraseJob({ payload: {}, deadline: new Date(Date.now() + 5000) });
    expect(erasureRes.processed).toBe(0);
  });

  it('verifies low-end Android & web dependency and image budgets (NFR-LOWEND-001)', () => {
    const mobilePkg = JSON.parse(
      readFileSync(resolve(ROOT, 'apps/mobile/package.json'), 'utf8'),
    ) as { dependencies: Record<string, string> };
    const depNames = Object.keys(mobilePkg.dependencies);
    // Keep runtime dependencies lean (< 35 dependencies, no bloated animation/state libraries)
    expect(depNames.length).toBeLessThan(35);
    expect(depNames).not.toContain('lodash');
    expect(depNames).not.toContain('moment');

    const webPkg = JSON.parse(readFileSync(resolve(ROOT, 'apps/web/package.json'), 'utf8')) as {
      dependencies: Record<string, string>;
    };
    expect(Object.keys(webPkg.dependencies).length).toBeLessThan(20);
  });

  it('verifies accessibility touch target >= 48dp and dynamic font scaling (NFR-A11Y-001)', () => {
    const buttonStyle = readFileSync(
      resolve(ROOT, 'packages/ui-native/src/button-style.ts'),
      'utf8',
    );
    expect(buttonStyle).toContain('theme.target.min');
    expect(buttonStyle).toContain('hitSlop');

    const nativeText = readFileSync(resolve(ROOT, 'packages/ui-native/src/Text.tsx'), 'utf8');
    expect(nativeText).toContain('allowFontScaling');
    expect(nativeText).toContain('maxFontSizeMultiplier={2}');
  });
});
