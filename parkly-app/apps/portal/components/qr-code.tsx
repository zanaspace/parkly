import { qrMatrix } from '@parkly/domain/qr';

/** Quiet zone around the code, in modules (QR spec minimum is 4). */
const QUIET = 4;

/**
 * QR code drawn as one SVG path on the server. Always dark on light
 * (`--pk-color-qr-*`), also in dark mode, so scanners read it.
 */
export function QrCode({ value, label }: { value: string; label: string }) {
  const grid = qrMatrix(value);
  const size = grid.length + QUIET * 2;
  let d = '';
  grid.forEach((row, r) => {
    row.forEach((dark, c) => {
      if (dark) d += `M${c + QUIET} ${r + QUIET}h1v1h-1z`;
    });
  });
  return (
    <svg
      className="pk-qr"
      viewBox={`0 0 ${size} ${size}`}
      role="img"
      aria-label={label}
      shapeRendering="crispEdges"
    >
      <rect width={size} height={size} fill="var(--pk-color-qr-bg)" />
      <path d={d} fill="var(--pk-color-qr-fg)" />
    </svg>
  );
}
