'use client';

import type { Booking } from '@parkly/contracts';
import jsQR from 'jsqr';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { submitSelfCheck } from '../lib/booking-actions';
import { AlertCircleIcon, CameraIcon, CheckCircleIcon } from './icons';

type Detector = { detect(source: HTMLVideoElement): Promise<{ rawValue: string }[]> };
type DetectorCtor = new (opts: { formats: string[] }) => Detector;

export function SelfCheckinAction({
  booking,
  onDone,
}: {
  booking: Booking;
  onDone?: () => void;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const doneRef = useRef(false);

  // Eligible when confirmed and not checked in, or checked in and not checked out
  const kind: 'in' | 'out' | null =
    booking.status === 'CONFIRMED' && !booking.stay?.checkedInAt
      ? 'in'
      : booking.status === 'CHECKED_IN' && !booking.stay?.checkedOutAt
      ? 'out'
      : null;

  useEffect(() => {
    if (!open) return;
    doneRef.current = false;
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
        const v = videoRef.current;
        if (!v) return;
        v.srcObject = stream;
        await v.play();
        timer = setInterval(() => {
          if (doneRef.current) return;
          void read(v).then((code) => {
            if (code && !doneRef.current) {
              doneRef.current = true;
              navigator.vibrate?.(80);
              void handleScanned(code);
            }
          });
        }, 250);
      } catch {
        setError('Camera access not granted or unavailable. Please enable camera permissions.');
      }
    })();

    return () => {
      if (timer) clearInterval(timer);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [open]);

  if (!kind) return null;

  const verb = kind === 'in' ? 'Check in' : 'Check out';

  async function handleScanned(code: string) {
    if (!kind) return;
    setError(null);
    setSending(true);

    if (!navigator.geolocation) {
      setError('Location services are not supported by your browser.');
      setSending(false);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const res = await submitSelfCheck(booking.id, kind, {
            clientEventId: crypto.randomUUID(),
            code,
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
          });
          if (res.ok) {
            setSuccess(`${verb} successful! Updating your booking status…`);
            setTimeout(() => {
              setOpen(false);
              setSuccess(null);
              router.refresh();
              onDone?.();
            }, 1200);
          } else {
            setError(res.message ?? 'Check-in failed. Please try again.');
            doneRef.current = false;
          }
        } catch {
          setError('Network error during verification. Please try again.');
          doneRef.current = false;
        } finally {
          setSending(false);
        }
      },
      () => {
        setError('Location permission required to verify you are at the parking facility.');
        setSending(false);
        doneRef.current = false;
      },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }

  return (
    <div style={{ marginTop: '0.75rem' }}>
      <button
        type="button"
        className="pk-btn-secondary"
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '0.5rem',
          padding: '0.625rem 1rem',
          fontWeight: 600,
        }}
        onClick={() => {
          setError(null);
          setSuccess(null);
          setOpen(true);
        }}
      >
        <CameraIcon size={18} />
        <span>{verb} (scan barrier or attendant QR)</span>
      </button>

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.75)',
            zIndex: 9999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '1rem',
          }}
        >
          <div
            style={{
              backgroundColor: 'var(--pk-color-bg-surface, #ffffff)',
              color: 'var(--pk-color-text-primary, #0f172a)',
              borderRadius: 'var(--pk-radius-lg, 12px)',
              maxWidth: '420px',
              width: '100%',
              padding: '1.25rem',
              display: 'flex',
              flexDirection: 'column',
              gap: '1rem',
              boxShadow: 'var(--pk-shadow-lg, 0 10px 25px -5px rgba(0, 0, 0, 0.3))',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <CameraIcon size={20} style={{ color: 'var(--pk-color-brand-primary, #137066)' }} />
                <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 600 }}>{verb} Scanner</h3>
              </div>
              <button
                type="button"
                className="pk-btn-ghost"
                style={{ padding: '0.25rem 0.5rem', fontSize: '0.85rem' }}
                onClick={() => setOpen(false)}
              >
                Close
              </button>
            </div>

            <p style={{ margin: 0, fontSize: '0.875rem', color: 'var(--pk-color-text-secondary, #475569)' }}>
              Point your camera at the Parkly barcode at the entrance barrier or on the attendant’s
              phone.
            </p>

            {error && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  padding: '0.625rem',
                  borderRadius: '6px',
                  backgroundColor: '#fef2f2',
                  color: '#991b1b',
                  fontSize: '0.825rem',
                }}
              >
                <AlertCircleIcon size={16} />
                <span>{error}</span>
              </div>
            )}

            {success && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  padding: '0.625rem',
                  borderRadius: '6px',
                  backgroundColor: '#f0fdf4',
                  color: '#166534',
                  fontSize: '0.825rem',
                }}
              >
                <CheckCircleIcon size={16} />
                <span>{success}</span>
              </div>
            )}

            <div
              style={{
                position: 'relative',
                width: '100%',
                aspectRatio: '1',
                backgroundColor: '#000000',
                borderRadius: '8px',
                overflow: 'hidden',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <video
                ref={videoRef}
                muted
                playsInline
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              />
              {sending && (
                <div
                  style={{
                    position: 'absolute',
                    inset: 0,
                    backgroundColor: 'rgba(0, 0, 0, 0.6)',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '0.5rem',
                    color: '#ffffff',
                    fontSize: '0.9rem',
                  }}
                >
                  <div className="pk-spinner" />
                  <span>Verifying at car park…</span>
                </div>
              )}
            </div>

            <button
              type="button"
              className="pk-btn-secondary"
              style={{ width: '100%' }}
              onClick={() => setOpen(false)}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
