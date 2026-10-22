'use client';

import { Button } from '@parkly/ui';
import jsQR from 'jsqr';
import { useEffect, useRef, useState } from 'react';

// Chrome on Android has a native QR reader; the DOM lib does not type it yet.
type Detector = { detect(source: HTMLVideoElement): Promise<{ rawValue: string }[]> };
type DetectorCtor = new (opts: { formats: string[] }) => Detector;

/**
 * A-03 camera (doc 03 §3.3): the back camera, read a few times a second until
 * a QR is found. Uses the browser's BarcodeDetector when it exists (fast on
 * low-end Android) and jsQR on a canvas otherwise.
 */
export function Scanner({
  onResult,
  onCancel,
}: {
  onResult: (text: string) => void;
  onCancel: () => void;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);
  const done = useRef(false);
  const report = useRef(onResult);
  report.current = onResult;

  useEffect(() => {
    let stream: MediaStream | null = null;
    let timer: ReturnType<typeof setInterval> | undefined;
    const canvas = document.createElement('canvas');
    const Ctor = (globalThis as unknown as { BarcodeDetector?: DetectorCtor }).BarcodeDetector;
    const detector = Ctor ? new Ctor({ formats: ['qr_code'] }) : null;

    async function read(v: HTMLVideoElement): Promise<string | null> {
      if (detector) {
        const found = await detector.detect(v).catch(() => []);
        return found[0]?.rawValue ?? null;
      }
      const w = v.videoWidth;
      const h = v.videoHeight;
      if (!w || !h) return null;
      // Scale down: jsQR is plenty accurate at ~640 px and much faster.
      const scale = Math.min(1, 640 / Math.max(w, h));
      canvas.width = Math.round(w * scale);
      canvas.height = Math.round(h * scale);
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) return null;
      ctx.drawImage(v, 0, 0, canvas.width, canvas.height);
      const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
      return jsQR(img.data, img.width, img.height)?.data ?? null;
    }

    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' } },
          audio: false,
        });
        const v = video.current;
        if (!v) return;
        v.srcObject = stream;
        await v.play();
        timer = setInterval(() => {
          if (done.current) return;
          void read(v).then((text) => {
            if (text && !done.current) {
              done.current = true;
              navigator.vibrate?.(80);
              report.current(text);
            }
          });
        }, 250);
      } catch {
        setError(
          'The camera is not available. Allow camera access, or look the booking up by code or plate.',
        );
      }
    })();

    return () => {
      if (timer) clearInterval(timer);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  return (
    <div className="pk-stack">
      {error ? (
        <p className="pk-notice pk-notice--error" role="alert">
          {error}
        </p>
      ) : (
        <video ref={video} className="pk-attend-video" muted playsInline aria-label="Camera" />
      )}
      <Button size="lg" variant="secondary" fullWidth onClick={onCancel}>
        Cancel
      </Button>
    </div>
  );
}
