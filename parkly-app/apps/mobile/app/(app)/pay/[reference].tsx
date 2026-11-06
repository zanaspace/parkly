import { Button, Text, useTheme } from '@parkly/ui-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Linking, Platform, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';
import { Notice } from '../../../src/components/Notice';
import { ApiError } from '../../../src/lib/api';
import { api } from '../../../src/lib/client';
import { checkoutState, type CheckoutState } from '@parkly/domain/booking';
import { GENERIC_ERROR_MESSAGE } from '../../../src/logic/errors';

const POLL_MS = 3_000;

const MESSAGE: Record<Exclude<CheckoutState, 'waiting' | 'paid'>, string> = {
  failed: 'The payment didn’t go through and your space was released. Nothing was charged.',
  expired: 'The 10 minutes to pay ran out, so the space was released.',
  refunding:
    'Your payment arrived after the space was released, so we’re refunding it in full. It can take a few days to reach you.',
};

const OVERSTAY_MESSAGE: Record<Exclude<CheckoutState, 'waiting' | 'paid'>, string> = {
  failed: 'The overstay payment didn’t go through. Nothing was charged.',
  expired: 'The payment session ended. You can reinitiate payment below to settle your overstay.',
  refunding: 'Your payment was refunded. Please reinitiate payment below to settle your overstay.',
};

const EXTENSION_MESSAGE: Record<Exclude<CheckoutState, 'waiting' | 'paid'>, string> = {
  failed: 'The extension payment didn’t go through. Nothing was charged.',
  expired: 'The payment session ended. You can return to your booking to try extending again.',
  refunding: 'Your payment was refunded. Please return to your booking to try extending again.',
};

/**
 * Paystack checkout and D-16 (doc 03 §1.4, doc 01 §5.2): checkout inside the app. While it is open
 * the app asks the server every 3 seconds; the server checks with Paystack,
 * and only its answer moves the driver on.
 */
export default function Pay() {
  const theme = useTheme();
  const router = useRouter();
  const { reference, url, bookingId, kind } = useLocalSearchParams<{
    reference: string;
    url: string;
    bookingId: string;
    kind?: string;
  }>();
  const [currentRef, setCurrentRef] = useState(reference);
  const [currentUrl, setCurrentUrl] = useState(url);
  const [bookingStatus, setBookingStatus] = useState<string | null>(null);
  const [reinitiating, setReinitiating] = useState(false);
  const [state, setState] = useState<Exclude<CheckoutState, 'paid'>>('waiting');
  const [error, setError] = useState<string | null>(null);
  const done = useRef(false);

  const isOverstay =
    kind === 'overstay' || bookingStatus === 'CHECKED_IN' || bookingStatus === 'COMPLETED';
  const isExtension = kind === 'extension';

  const check = useCallback(async () => {
    if (done.current) return;
    try {
      const r = await api.verifyPayment(currentRef);
      setBookingStatus(r.booking.status);
      const next = checkoutState({ booking: r.booking.status, payment: r.payment.status });
      setError(null);
      if (next === 'waiting') return;
      done.current = true;
      if (next === 'paid') router.replace({ pathname: '/booking/[id]', params: { id: bookingId } });
      else setState(next);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : GENERIC_ERROR_MESSAGE);
    }
  }, [currentRef, bookingId, router]);

  useEffect(() => {
    const timer = setInterval(() => void check(), POLL_MS);
    return () => clearInterval(timer);
  }, [check]);

  const handleReinitiate = async () => {
    if (!bookingId) {
      router.replace('/home');
      return;
    }
    setReinitiating(true);
    setError(null);
    try {
      const idempotencyKey = `ovr-${bookingId}-${Date.now()}`;
      const res = await api.payOverstay(bookingId, {}, idempotencyKey);
      if (res.payment.authorizationUrl) {
        setCurrentRef(res.payment.reference);
        setCurrentUrl(res.payment.authorizationUrl);
        done.current = false;
        setState('waiting');
      } else {
        router.replace({ pathname: '/booking/[id]', params: { id: bookingId } });
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : GENERIC_ERROR_MESSAGE);
    } finally {
      setReinitiating(false);
    }
  };

  if (state !== 'waiting') {
    const activeMessages = isOverstay
      ? OVERSTAY_MESSAGE
      : isExtension
        ? EXTENSION_MESSAGE
        : MESSAGE;

    return (
      <SafeAreaView
        style={{ flex: 1, padding: theme.space.layout.gutter, gap: theme.space.stack.md }}
      >
        <Text variant="heading.xl">Payment</Text>
        <Notice kind={state === 'refunding' ? 'info' : 'warning'} message={activeMessages[state]} />
        {error ? <Notice message={error} /> : null}

        {isOverstay && bookingId ? (
          <>
            <Button
              label="Reinitiate payment"
              fullWidth
              loading={reinitiating}
              onPress={handleReinitiate}
            />
            <Button
              label="Back to booking"
              variant="secondary"
              fullWidth
              onPress={() =>
                router.replace({ pathname: '/booking/[id]', params: { id: bookingId } })
              }
            />
            <Button
              label="Back to home"
              variant="ghost"
              fullWidth
              onPress={() => router.replace('/home')}
            />
          </>
        ) : bookingId ? (
          <>
            <Button
              label="Back to booking"
              fullWidth
              onPress={() =>
                router.replace({ pathname: '/booking/[id]', params: { id: bookingId } })
              }
            />
            <Button
              label="Back to home"
              variant="ghost"
              fullWidth
              onPress={() => router.replace('/home')}
            />
          </>
        ) : (
          <Button label="Back to home" fullWidth onPress={() => router.replace('/home')} />
        )}
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.color.bg.canvas }}>
      {Platform.OS === 'web' ? (
        <View style={{ flex: 1, padding: theme.space.layout.gutter, gap: theme.space.stack.md }}>
          <Text>Pay in the Paystack tab, then come back here.</Text>
          <Button label="Open Paystack" onPress={() => void Linking.openURL(currentUrl)} />
        </View>
      ) : (
        <WebView
          source={{ uri: currentUrl }}
          style={{ flex: 1 }}
          // Paystack's success page can redirect; check straight away rather than waiting.
          onNavigationStateChange={() => void check()}
          startInLoadingState
        />
      )}
      <View style={{ padding: theme.space.layout.gutter, gap: theme.space.stack.sm }}>
        {error ? <Notice message={error} /> : null}
        <Button
          label="I’ve paid – check now"
          variant="secondary"
          fullWidth
          onPress={() => void check()}
        />
        <Button
          label="Cancel"
          variant="ghost"
          fullWidth
          onPress={() => router.replace({ pathname: '/booking/[id]', params: { id: bookingId } })}
        />
      </View>
    </SafeAreaView>
  );
}
