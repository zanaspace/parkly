import { describe, expect, it } from 'vitest';
import { canManageSettings, formatSettingValue, settingLimits } from './copy';

describe('platform settings copy', () => {
  it('shows settings only to super admins', () => {
    expect(canManageSettings([{ role: 'SUPER_ADMIN' }])).toBe(true);
    for (const role of ['ADMIN_OPS', 'ADMIN_FINANCE', 'ADMIN_SUPPORT', 'ADMIN_COMPLIANCE'])
      expect(canManageSettings([{ role }])).toBe(false);
  });

  it('writes a value in the unit people think in', () => {
    expect(formatSettingValue({ kind: 'int', unit: 'minutes', value: 15 })).toBe('15 minutes');
    expect(formatSettingValue({ kind: 'int', unit: 'kobo', value: 5_000_000 })).toBe('₦50,000');
    expect(formatSettingValue({ kind: 'int', unit: 'basis points', value: 750 })).toBe('7.5%');
    expect(formatSettingValue({ kind: 'boolean', unit: null, value: true })).toBe('On');
    expect(formatSettingValue({ kind: 'boolean', unit: null, value: false })).toBe('Off');
  });

  it('says the limits and the default under the box', () => {
    expect(settingLimits({ kind: 'int', unit: 'minutes', min: 1, max: 60, default: 10 })).toBe(
      'Between 1 and 60. Default 10 minutes.',
    );
    expect(
      settingLimits({ kind: 'boolean', unit: null, min: null, max: null, default: false }),
    ).toBe('Default Off.');
  });
});
