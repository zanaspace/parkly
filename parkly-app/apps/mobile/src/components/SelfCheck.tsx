import type { Booking } from '@parkly/contracts';
import { Button, Text, useTheme } from '@parkly/ui-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Crypto from 'expo-crypto';
import * as Location from 'expo-location';
import { useRef, useState } from 'react';
import { View } from 'react-native';
import { ApiError } from '../lib/api';
import { api } from '../lib/client';
import { GENERIC_ERROR_MESSAGE } from '../logic/errors';
import { selfCheckKind } from '../logic/self-check';
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
  const eventId = useRef<string | null>(null);
  if (!kind) return null;
  const verb = kind === 'in' ? 'Check in' : 'Check out';

  async function start() {
    setError(null);
    const cam = permission?.granted ? permission : await requestPermission();
    if (!cam.granted) {
      setError('Allow the camera for Parkly to scan the barrier poster or attendant’s phone, or show your ticket at the gate.');
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
      setError(err instanceof ApiError ? err.message : GENERIC_ERROR_MESSAGE);
    } finally {
      setSending(false);
    }
  }

  return (
    <View style={{ gap: theme.space.stack.sm }}>
      {scanning ? (
        <>
          <Text tone="secondary">Point the camera at the Parkly barcode at the barrier or on the attendant’s phone.</Text>
          <CameraView
            style={{ width: '100%', aspectRatio: 1, borderRadius: theme.card.radius }}
            facing="back"
            barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
            onBarcodeScanned={({ data }) => void scanned(data)}
          />
          <Button label="Cancel" variant="ghost" fullWidth onPress={() => setScanning(false)} />
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
