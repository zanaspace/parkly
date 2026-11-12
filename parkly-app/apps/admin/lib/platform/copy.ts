import type { SettingItem } from '@parkly/contracts';

// Mirrors the API's `platform:settings:manage` rule; the API enforces it.
export const canManageSettings = (roles: { role: string }[]) =>
  roles.some((r) => r.role === 'SUPER_ADMIN');

/** "15 minutes", "₦50,000" for kobo, "7.5%" for basis points, "on" or "off". */
export function formatSettingValue(item: Pick<SettingItem, 'kind' | 'unit' | 'value'>): string {
  if (typeof item.value === 'boolean') return item.value ? 'On' : 'Off';
  if (item.unit === 'kobo') return `₦${(item.value / 100).toLocaleString('en-NG')}`;
  if (item.unit === 'basis points') return `${item.value / 100}%`;
  return item.unit ? `${item.value} ${item.unit}` : String(item.value);
}

/** The words under the box: the limits and the default. */
export function settingLimits(
  item: Pick<SettingItem, 'kind' | 'min' | 'max' | 'default' | 'unit'>,
): string {
  const def = formatSettingValue({ ...item, value: item.default });
  if (item.kind === 'boolean') return `Default ${def}.`;
  return `Between ${item.min} and ${item.max}. Default ${def}.`;
}
