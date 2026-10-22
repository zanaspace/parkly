import { Button, Text, useTheme } from '@parkly/ui-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Linking, Platform, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';
import { Notice } from '../../../src/components/Notice';
import { ApiError } from '../../../src/lib/api';
import { api } from '../../../src/lib/client';
import { checkoutState, type CheckoutState } from '../../../src/logic/booking';
import { GENERIC_ERROR_MESSAGE } from '../../../src/logic/errors';

const POLL_MS = 3_000;

const MESSAGE: Record<Exclude<CheckoutState, 'waiting' | 'paid'>, string> = {
  failed: 'The payment didn’t go through and your space was released. Nothing was charged.',
  expired: 'The 10 minutes to pay ran out, so the space was released.',
  refunding:
    'Your payment arrived after the space was released, so we’re refunding it in full. It can take a few days to reach you.',
};

/**
 * Paystack checkout and D-16 (doc 03 §1.4, doc 01 §5.2): checkout inside the app. While it is open
 * the app asks the server every 3 seconds; the server checks with Paystack,
 * and only its answer moves the driver on.
 */
export default function Pay() {
  const theme = useTheme();
  const router = useRouter();
  const { reference, url, bookingId } = useLocalSearchParams<{
    reference: string;
    url: string;
    bookingId: string;
  }>();
  const [state, setState] = useState<Exclude<CheckoutState, 'paid'>>('waiting');
  const [error, setError] = useState<string | null>(null);
  const done = useRef(false);

  const check = useCallback(async () => {
    if (done.current) return;
    try {
      const r = await api.verifyPayment(reference);
      const next = checkoutState({ booking: r.booking.status, payment: r.payment.status });
      setError(null);
      if (next === 'waiting') return;
      done.current = true;
      if (next === 'paid') router.replace({ pathname: '/booking/[id]', params: { id: bookingId } });
      else setState(next);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : GENERIC_ERROR_MESSAGE);
    }
  }, [reference, bookingId, router]);

  useEffect(() => {
    const timer = setInterval(() => void check(), POLL_MS);
    return () => clearInterval(timer);
  }, [check]);

  if (state !== 'waiting')
    return (
      <SafeAreaView
        style={{ flex: 1, padding: theme.space.layout.gutter, gap: theme.space.stack.md }}
      >
        <Text variant="heading.xl">Payment</Text>
        <Notice kind={state === 'refunding' ? 'info' : 'warning'} message={MESSAGE[state]} />
        <Button label="Back to home" fullWidth onPress={() => router.replace('/home')} />
      </SafeAreaView>
    );

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.color.bg.canvas }}>
      {Platform.OS === 'web' ? (
        <View style={{ flex: 1, padding: theme.space.layout.gutter, gap: theme.space.stack.md }}>
          <Text>Pay in the Paystack tab, then come back here.</Text>
          <Button label="Open Paystack" onPress={() => void Linking.openURL(url)} />
        </View>
      ) : (
        <WebView
          source={{ uri: url }}
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
