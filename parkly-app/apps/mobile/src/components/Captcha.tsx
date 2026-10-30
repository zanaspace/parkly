import { useMemo, useState, type ReactElement } from 'react';
import { useColorScheme, View } from 'react-native';
import { WebView } from 'react-native-webview';
import { captchaEnabled, config } from '../lib/config';
import { captchaHtml, readCaptchaMessage } from '../logic/captcha-html';

// Turnstile's widget is 65 points tall; this leaves room for its border.
const WIDGET_HEIGHT = 72;

function CaptchaView({ onToken }: { onToken: (token: string | null) => void }) {
  const theme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const html = useMemo(() => captchaHtml({ siteKey: config.turnstileSiteKey, theme }), [theme]);
  return (
    <View accessibilityLabel="Security check" style={{ height: WIDGET_HEIGHT }}>
      <WebView
        originWhitelist={['*']}
        // Turnstile only runs on hostnames listed for the site key, so the page
        // takes the origin of one of them (ADR 0019).
        source={{ html, baseUrl: config.turnstileOrigin }}
        javaScriptEnabled
        setSupportMultipleWindows={false}
        scrollEnabled={false}
        onMessage={(e) => {
          const msg = readCaptchaMessage(e.nativeEvent.data);
          if (msg) onToken(msg.token);
        }}
        style={{ backgroundColor: 'transparent' }}
      />
    </View>
  );
}

/**
 * The security check before a sign-in code is sent (doc 05 §4.1). Without a
 * site key it is off: `ready` is true and `widget` is null. A token works
 * once, so call `used()` after each request to get a fresh check.
 */
export function useCaptcha(): {
  ready: boolean;
  token: string | undefined;
  widget: ReactElement | null;
  used: () => void;
} {
  const [token, setToken] = useState<string | null>(null);
  const [round, setRound] = useState(0);
  return {
    ready: !captchaEnabled || token !== null,
    token: token ?? undefined,
    widget: captchaEnabled ? <CaptchaView key={round} onToken={setToken} /> : null,
    used: () => {
      setToken(null);
      setRound((r) => r + 1);
    },
  };
}
