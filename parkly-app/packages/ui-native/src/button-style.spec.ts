import { theme } from '@parkly/tokens/native';
import { describe, expect, it } from 'vitest';
import { buttonColors, buttonMetrics } from './button-style.js';

describe('buttonColors', () => {
  it('uses action tokens for primary, pressed and inactive states', () => {
    const t = theme.light;
    expect(buttonColors(t, 'primary', { pressed: false, inactive: false })).toEqual({
      bg: '#137066',
      fg: '#FFFFFF',
    });
    expect(buttonColors(t, 'primary', { pressed: true, inactive: false }).bg).toBe('#0D4843');
    expect(buttonColors(t, 'danger', { pressed: false, inactive: true })).toEqual({
      bg: '#E9EBEA',
      fg: '#8A9290',
    });
  });

  it('switches to dark values in dark mode', () => {
    expect(buttonColors(theme.dark, 'primary', { pressed: false, inactive: false })).toEqual({
      bg: '#71C4B8',
      fg: '#062321',
    });
  });

  it('keeps ghost transparent until pressed', () => {
    expect(buttonColors(theme.light, 'ghost', { pressed: false, inactive: false }).bg).toBe(
      'transparent',
    );
  });
});

describe('buttonMetrics', () => {
  it('extends small buttons to the 48 dp touch target with hitSlop', () => {
    expect(buttonMetrics(theme.light, 'sm')).toMatchObject({
      height: 36,
      hitSlop: 6,
      borderRadius: 8,
    });
    expect(buttonMetrics(theme.light, 'md')).toMatchObject({
      height: 48,
      hitSlop: 0,
      borderRadius: 12,
    });
  });
});
