import type { Booking, EarlyStartOption } from '@parkly/contracts';
import { formatNaira } from '@parkly/domain/money';
import { Button, Text, useTheme } from '@parkly/ui-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useRouter } from 'expo-router';
import * as Crypto from 'expo-crypto';
import * as Location from 'expo-location';
import { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import { ApiError } from '../lib/api';
import { api } from '../lib/client';
import { GENERIC_ERROR_MESSAGE } from '../logic/errors';
import {
  checkInNotYet,
  outsideWindowMessage,
  positionProblem,
  selfCheckKind,
} from '../logic/self-check';
import { Notice } from './Notice';

/**
 * D-17 "Check in yourself" (ADR 0016): scan the entrance poster, send where the
 * phone is, and let the server decide. The event id is kept until it succeeds,
 * so a retried scan is the same check-in.
 */
export function SelfCheck({ booking, onDone }: { booking: Booking; onDone: () => void }) {
  const theme = useTheme();
  const kind = selfCheckKind(booking);
  const [permission, requestPermission] = useCameraPermissions();
  const [scanning, setScanning] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const eventId = useRef<string | null>(null);
  // ADR 0023: before the gate accepts the car, show when it will; the button
  // appears by itself at that time.
  const notYet = kind === 'in' ? checkInNotYet(booking, now) : null;
  useEffect(() => {
    if (!notYet) return;
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, [notYet]);
  // ADR 0023 stage 2: while it's too early, offer to start now if there's space.
  const router = useRouter();
  const [early, setEarly] = useState<EarlyStartOption | null>(null);
  const [buying, setBuying] = useState(false);
  const waiting = notYet !== null;
  useEffect(() => {
    if (!waiting) return setEarly(null);
    let live = true;
    api
      .earlyStartOption(booking.id)
      .then((o) => live && setEarly(o))
      .catch(() => live && setEarly(null));
    return () => {
      live = false;
    };
  }, [waiting, booking.id]);

  async function startEarly() {
    if (!early?.newStartAt) return;
    setBuying(true);
    setError(null);
    try {
      const res = await api.startEarly(
        booking.id,
        early.newStartAt,
        `early-${booking.id}-${Date.parse(early.newStartAt)}`,
      );
      if (res.payment?.authorizationUrl)
        router.push({
          pathname: '/pay/[reference]',
          params: {
            reference: res.payment.reference,
            url: res.payment.authorizationUrl,
            bookingId: booking.id,
          },
        });
      else onDone();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : GENERIC_ERROR_MESSAGE);
    } finally {
      setBuying(false);
    }
  }
  if (!kind) return null;
  const verb = kind === 'in' ? 'Check in' : 'Check out';

  async function start() {
    setError(null);
    const cam = permission?.granted ? permission : await requestPermission();
    if (!cam.granted) {
      setError(
        'Allow the camera for Parkly to scan the barrier poster or attendant’s phone, or show your ticket at the gate.',
      );
      return;
    }
    const loc = await Location.requestForegroundPermissionsAsync();
    if (!loc.granted) {
      setError('Parkly needs your location to check you are at the car park.');
      return;
    }
    setScanning(true);
  }

  async function scanned(code: string) {
    if (sending || !kind) return;
    setScanning(false);
    setSending(true);
    try {
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      const problem = positionProblem(pos);
      if (problem) {
        setError(problem);
        return;
      }
      eventId.current ??= Crypto.randomUUID();
      await api.selfCheck(booking.id, kind, {
        clientEventId: eventId.current,
        code,
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
      });
      eventId.current = null;
      onDone();
    } catch (err) {
      if (err instanceof ApiError && err.code === 'QR_OUTSIDE_WINDOW')
        setError(outsideWindowMessage(booking, Date.now()));
      else setError(err instanceof ApiError ? err.message : GENERIC_ERROR_MESSAGE);
    } finally {
      setSending(false);
    }
  }

  return (
    <View style={{ gap: theme.space.stack.sm }}>
      {scanning ? (
        <>
          <Text tone="secondary">
            Point the camera at the Parkly barcode at the barrier or on the attendant’s phone.
          </Text>
          <CameraView
            style={{ width: '100%', aspectRatio: 1, borderRadius: theme.card.radius }}
            facing="back"
            barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
            onBarcodeScanned={({ data }) => void scanned(data)}
          />
          <Button label="Cancel" variant="ghost" fullWidth onPress={() => setScanning(false)} />
        </>
      ) : notYet ? (
        <>
          <Notice kind="info" message={notYet} />
          {early?.available && early.priceKobo !== null && early.newStartAt ? (
            <Button
              label={`Start now: ${formatNaira(early.priceKobo as never)} for ${early.addedMinutes} more minutes`}
              variant="secondary"
              size="lg"
              fullWidth
              loading={buying}
              onPress={() => void startEarly()}
            />
          ) : null}
        </>
      ) : (
        <Button
          label={`${verb} (scan barrier or attendant)`}
          variant="primary"
          size="lg"
          fullWidth
          loading={sending}
          onPress={() => void start()}
        />
      )}
      {error ? <Notice message={error} /> : null}
    </View>
  );
}
