import { qrMatrix } from '@parkly/domain/qr';
import { useTheme } from '@parkly/ui-native';
import { useMemo } from 'react';
import { View } from 'react-native';

/** Quiet zone around the code, in modules (QR spec minimum is 4). */
const QUIET = 4;

/**
 * Draws a QR code with plain Views (no native module, so it works in Expo Go).
 * Dark modules in a row are merged into one View to keep the count low.
 * Always dark on light (`color.qr`), also in dark mode, so scanners read it.
 */
export function QrCode({ value, size, label }: { value: string; size: number; label: string }) {
  const theme = useTheme();
  const rows = useMemo(() => {
    const grid = qrMatrix(value);
    return grid.map((row) => {
      const runs: { start: number; length: number }[] = [];
      row.forEach((dark, c) => {
        const last = runs[runs.length - 1];
        if (!dark) return;
        if (last && last.start + last.length === c) last.length += 1;
        else runs.push({ start: c, length: 1 });
      });
      return runs;
    });
  }, [value]);
  const cell = size / (rows.length + QUIET * 2);

  return (
    <View
      accessibilityRole="image"
      accessibilityLabel={label}
      style={{
        width: size,
        height: size,
        padding: cell * QUIET,
        backgroundColor: theme.color.qr.bg,
      }}
    >
      {rows.map((runs, r) => (
        <View key={r} style={{ height: cell, flexDirection: 'row' }}>
          {runs.map((run) => (
            <View
              key={run.start}
              style={{
                position: 'absolute',
                left: run.start * cell,
                width: run.length * cell,
                height: cell,
                backgroundColor: theme.color.qr.fg,
              }}
            />
          ))}
        </View>
      ))}
    </View>
  );
}
