import { describe, expect, it } from 'vitest';
import { checkSettingValue, FEATURE_FLAGS, findFlag, findSetting, SETTINGS } from './settings.js';

const def = (key: string) => {
  const d = findSetting(key);
  if (!d) throw new Error(`no setting ${key}`);
  return d;
};

describe('setting values', () => {
  it('accepts a whole number inside the limits and refuses the rest', () => {
    const hold = def('booking.hold_minutes');
    expect(checkSettingValue(hold, 15)).toEqual({ ok: true, value: 15 });
    expect(checkSettingValue(hold, 1).ok).toBe(true);
    expect(checkSettingValue(hold, 60).ok).toBe(true);
    for (const bad of [0, 61, 1.5, '15', null, true, Number.NaN])
      expect(checkSettingValue(hold, bad).ok, String(bad)).toBe(false);
    expect(checkSettingValue(hold, 61)).toEqual({ ok: false, reason: 'Must be at most 60' });
  });

  it('keeps commission to 10 to 15 percent', () => {
    const c = def('fees.commission_bps_default');
    expect(checkSettingValue(c, 1000).ok).toBe(true);
    expect(checkSettingValue(c, 1500).ok).toBe(true);
    expect(checkSettingValue(c, 999).ok).toBe(false);
    expect(checkSettingValue(c, 1501).ok).toBe(false);
  });

  it('takes true or false for an on/off setting, nothing else', () => {
    const vat = def('fees.vat_enabled');
    expect(checkSettingValue(vat, true)).toEqual({ ok: true, value: true });
    expect(checkSettingValue(vat, false)).toEqual({ ok: true, value: false });
    expect(checkSettingValue(vat, 1).ok).toBe(false);
    expect(checkSettingValue(vat, 'true').ok).toBe(false);
  });
});

describe('the lists', () => {
  it('has unique keys, defaults inside the limits and a label for each', () => {
    expect(new Set(SETTINGS.map((s) => s.key)).size).toBe(SETTINGS.length);
    for (const s of SETTINGS) {
      expect(checkSettingValue(s, s.default).ok, s.key).toBe(true);
      expect(s.label.length).toBeGreaterThan(2);
    }
    expect(new Set(FEATURE_FLAGS.map((f) => f.key)).size).toBe(FEATURE_FLAGS.length);
  });

  it('finds a setting or a flag by key, and not an unknown one', () => {
    expect(findSetting('refund.approval_threshold_kobo')?.default).toBe(5_000_000);
    expect(findSetting('nope')).toBeUndefined();
    expect(findFlag('claims_enabled')?.label).toBe('Claims');
    expect(findFlag('nope')).toBeUndefined();
  });
});
