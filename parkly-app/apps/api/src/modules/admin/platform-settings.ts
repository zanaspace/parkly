import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import {
  FeatureFlagItemSchema,
  FeatureFlagListSchema,
  SetFeatureFlagRequestSchema,
  SetSettingRequestSchema,
  SettingItemSchema,
  SettingListSchema,
} from '@parkly/contracts';
import {
  checkSettingValue,
  FEATURE_FLAGS,
  findFlag,
  findSetting,
  SETTINGS,
} from '@parkly/domain/platform';
import type { AppDeps } from '../../app.js';
import { authenticate, authorize, loadActor, type AuthEnv } from '../../auth/context.js';
import { audit } from '../../lib/audit.js';
import { ApiError } from '../../lib/errors.js';

const json = <T>(schema: T) => ({ content: { 'application/json': { schema } } });
const KeyParam = z.object({ key: z.string().min(1).max(100) });

/**
 * FR-ADM-005: super admins change platform settings and feature flags. Only
 * the settings and flags the platform defines can be changed, each within its
 * limits, and every change is audited with the old value, the new value and a
 * reason. Setting a value is naturally repeatable, so there is no Idempotency-Key.
 */
export function adminPlatformSettingsRoutes(deps: AppDeps) {
  const app = new OpenAPIHono<AuthEnv>();
  const secured = {
    security: [{ bearerAuth: [] }],
    middleware: [authenticate(deps.verifyToken), loadActor(deps.store)],
  };

  async function settingItem(key: string) {
    const def = findSetting(key);
    if (!def) throw new ApiError('NOT_FOUND', 'No such setting');
    const [saved] = await deps.store.settings.saved([key]);
    return view(def, saved);
  }

  function view(
    def: (typeof SETTINGS)[number],
    saved: { value: unknown; updatedAt: Date } | undefined,
  ) {
    // A saved value that no longer fits (edited by hand) shows as the default the API falls back to.
    const ok = saved ? checkSettingValue(def, saved.value) : null;
    const usable = saved && ok?.ok ? saved : undefined;
    return {
      key: def.key,
      label: def.label,
      description: def.description,
      kind: def.kind,
      unit: def.unit,
      min: def.min,
      max: def.max,
      default: def.default,
      value: usable ? (usable.value as number | boolean) : def.default,
      isDefault: !usable,
      updatedAt: usable ? usable.updatedAt.toISOString() : null,
    };
  }

  app.openapi(
    createRoute({
      method: 'get',
      path: '/admin/settings',
      tags: ['admin'],
      ...secured,
      responses: { 200: { description: 'Settings', ...json(SettingListSchema) } },
    }),
    async (c) => {
      authorize(c, deps.logger, 'platform:settings:manage', {});
      const saved = await deps.store.settings.saved(SETTINGS.map((s) => s.key));
      const byKey = new Map(saved.map((s) => [s.key, s]));
      return c.json({ items: SETTINGS.map((d) => view(d, byKey.get(d.key))) }, 200);
    },
  );

  app.openapi(
    createRoute({
      method: 'put',
      path: '/admin/settings/{key}',
      tags: ['admin'],
      ...secured,
      request: {
        params: KeyParam,
        body: { ...json(SetSettingRequestSchema), required: true },
      },
      responses: { 200: { description: 'Saved', ...json(SettingItemSchema) } },
    }),
    async (c) => {
      authorize(c, deps.logger, 'platform:settings:manage', {});
      const { key } = c.req.valid('param');
      const { value, reason } = c.req.valid('json');
      const def = findSetting(key);
      if (!def) throw new ApiError('NOT_FOUND', 'No such setting');
      const check = checkSettingValue(def, value);
      if (!check.ok)
        throw new ApiError('VALIDATION_FAILED', check.reason, {
          errors: [{ path: 'value', message: check.reason }],
        });
      const { before } = await deps.store.settings.put(
        key,
        check.value,
        c.get('actor').userId,
        deps.now(),
      );
      await audit(c, deps, {
        action: 'platform_setting.changed',
        entityType: 'platform_setting',
        entityId: key,
        before: { value: before ?? def.default },
        after: { value: check.value, reason },
      });
      return c.json(await settingItem(key), 200);
    },
  );

  app.openapi(
    createRoute({
      method: 'get',
      path: '/admin/feature-flags',
      tags: ['admin'],
      ...secured,
      responses: { 200: { description: 'Feature flags', ...json(FeatureFlagListSchema) } },
    }),
    async (c) => {
      authorize(c, deps.logger, 'platform:settings:manage', {});
      const rows = new Map((await deps.store.flags.list()).map((f) => [f.key, f]));
      return c.json(
        {
          items: FEATURE_FLAGS.map((f) => ({
            ...f,
            enabled: rows.get(f.key)?.enabled ?? false,
            updatedAt: rows.get(f.key)?.updatedAt.toISOString() ?? null,
          })),
        },
        200,
      );
    },
  );

  app.openapi(
    createRoute({
      method: 'put',
      path: '/admin/feature-flags/{key}',
      tags: ['admin'],
      ...secured,
      request: {
        params: KeyParam,
        body: { ...json(SetFeatureFlagRequestSchema), required: true },
      },
      responses: { 200: { description: 'Saved', ...json(FeatureFlagItemSchema) } },
    }),
    async (c) => {
      authorize(c, deps.logger, 'platform:settings:manage', {});
      const { key } = c.req.valid('param');
      const { enabled, reason } = c.req.valid('json');
      const def = findFlag(key);
      if (!def) throw new ApiError('NOT_FOUND', 'No such feature flag');
      const at = deps.now();
      const { before } = await deps.store.flags.put(key, enabled, c.get('actor').userId, at);
      await audit(c, deps, {
        action: 'feature_flag.changed',
        entityType: 'feature_flag',
        entityId: key,
        before: { enabled: before },
        after: { enabled, reason },
      });
      return c.json({ ...def, enabled, updatedAt: at.toISOString() }, 200);
    },
  );

  return app;
}
