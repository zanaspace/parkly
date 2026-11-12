import type { FeatureFlagList } from '@parkly/contracts';
import { Text } from '@parkly/ui';
import { FlagForm } from '../../../../components/platform-forms';
import { SettingsTabs } from '../../../../components/settings-tabs';
import { apiFetch } from '../../../../lib/api';
import { requireAccess } from '../../../../lib/auth/session';
import { lagosShort } from '../../../../lib/bookings/support';
import { publicEnv } from '../../../../lib/env';
import { canManageSettings } from '../../../../lib/platform/copy';

export const metadata = { title: 'Feature flags · Parkly Admin' };

/**
 * FR-ADM-005: switch features on and off. A flag takes effect only where the
 * platform reads it; the rest are saved for when their feature ships.
 */
export default async function FeatureFlagsPage() {
  const { me, accessToken } = await requireAccess();
  const allowed = canManageSettings(me.roles);
  const items = allowed
    ? await apiFetch<FeatureFlagList>(publicEnv().apiUrl, '/v1/admin/feature-flags', accessToken)
        .then((r) => r.items)
        .catch(() => null)
    : null;

  return (
    <main className="pk-page pk-page--wide pk-stack">
      <div>
        <Text variant="heading-xl">Feature flags</Text>
        <Text variant="body-sm" tone="secondary">
          Every change needs a reason and is recorded. A flag only does something once its feature
          is built and reads it.
        </Text>
      </div>

      {!allowed ? (
        <div className="pk-card">
          <Text variant="heading-md">Restricted Access</Text>
          <Text tone="secondary">Only super admins change feature flags.</Text>
        </div>
      ) : (
        <>
          <SettingsTabs active="flags" />
          {items === null ? (
            <Text role="status" tone="secondary">
              We couldn’t load the flags just now. Please refresh to try again.
            </Text>
          ) : (
            <ul className="pk-list pk-rates">
              {items.map((f) => (
                <li key={f.key} className="pk-card pk-stack">
                  <div className="pk-rates-summary">
                    <span>
                      <strong>{f.label}</strong>{' '}
                      <span
                        className={`pk-badge ${f.enabled ? 'pk-badge--live' : 'pk-badge--submitted'}`}
                      >
                        {f.enabled ? 'On' : 'Off'}
                      </span>
                    </span>
                    <Text as="span" variant="body-sm" tone="secondary">
                      {f.updatedAt ? `Changed ${lagosShort(f.updatedAt)}` : 'Never changed'}
                    </Text>
                  </div>
                  <Text variant="body-sm" tone="secondary">
                    {f.description}
                  </Text>
                  <details>
                    <summary className="pk-link">{f.enabled ? 'Turn off' : 'Turn on'}</summary>
                    <FlagForm item={f} />
                  </details>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </main>
  );
}
