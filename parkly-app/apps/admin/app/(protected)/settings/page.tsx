import type { SettingList } from '@parkly/contracts';
import { Text } from '@parkly/ui';
import { SettingForm } from '../../../components/platform-forms';
import { SettingsTabs } from '../../../components/settings-tabs';
import { apiFetch } from '../../../lib/api';
import { requireAccess } from '../../../lib/auth/session';
import { lagosShort } from '../../../lib/bookings/support';
import { publicEnv } from '../../../lib/env';
import { canManageSettings, formatSettingValue } from '../../../lib/platform/copy';

export const metadata = { title: 'Settings · Parkly Admin' };

/**
 * FR-ADM-005: business settings a super admin can change. Each change needs a
 * reason, stays inside its limits, and is recorded with the old and new value.
 * A change applies from the next booking or action; it doesn't rewrite the past.
 */
export default async function SettingsPage() {
  const { me, accessToken } = await requireAccess();
  const allowed = canManageSettings(me.roles);
  const items = allowed
    ? await apiFetch<SettingList>(publicEnv().apiUrl, '/v1/admin/settings', accessToken)
        .then((r) => r.items)
        .catch(() => null)
    : null;

  return (
    <main className="pk-page pk-page--wide pk-stack">
      <div>
        <Text variant="heading-xl">Platform settings</Text>
        <Text variant="body-sm" tone="secondary">
          Changes apply from the next booking or action; bookings already made keep what they were
          made with.
        </Text>
      </div>

      {!allowed ? (
        <div className="pk-card">
          <Text variant="heading-md">Restricted Access</Text>
          <Text tone="secondary">Only super admins change platform settings.</Text>
        </div>
      ) : (
        <>
          <SettingsTabs active="settings" />
          {items === null ? (
            <Text role="status" tone="secondary">
              We couldn’t load the settings just now. Please refresh to try again.
            </Text>
          ) : (
            <ul className="pk-list pk-rates">
              {items.map((i) => (
                <li key={i.key} className="pk-card pk-stack">
                  <div className="pk-rates-summary">
                    <span>
                      <strong>{i.label}</strong> · {formatSettingValue(i)}
                    </span>
                    <Text as="span" variant="body-sm" tone="secondary">
                      {i.isDefault
                        ? 'Default'
                        : i.updatedAt
                          ? `Changed ${lagosShort(i.updatedAt)}`
                          : 'Saved'}
                    </Text>
                  </div>
                  <Text variant="body-sm" tone="secondary">
                    {i.description}
                  </Text>
                  <details>
                    <summary className="pk-link">Change</summary>
                    <SettingForm item={i} />
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
