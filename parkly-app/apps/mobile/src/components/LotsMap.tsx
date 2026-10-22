import { useTheme } from '@parkly/ui-native';
import { useMemo } from 'react';
import { View } from 'react-native';
import { WebView } from 'react-native-webview';
import { mapHtml, readMapMessage, type MapPin } from '../logic/map-html';

/**
 * D-12 / D-13 map (ADR 0014): MapLibre + OpenFreeMap in a WebView. Pins
 * report taps back through `onOpen`; the list stays the accessible path.
 */
export function LotsMap(props: {
  pins: MapPin[];
  centre: { lat: number; lng: number };
  showCentre?: boolean;
  height?: number;
  onOpen?: (id: string) => void;
}) {
  const theme = useTheme();
  const html = useMemo(
    () =>
      mapHtml({
        pins: props.pins,
        centre: props.centre,
        showCentre: props.showCentre ?? false,
        colors: {
          pinBg: theme.color.bg.brand,
          pinFg: theme.color.text['on-brand'],
          centre: theme.color.status.info.icon,
          canvas: theme.color.bg.muted,
        },
      }),
    [props.pins, props.centre, props.showCentre, theme],
  );
  return (
    <View
      accessibilityLabel="Map of car parks"
      style={{
        height: props.height ?? 240,
        borderRadius: theme.card.radius,
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: theme.card.border,
      }}
    >
      <WebView
        originWhitelist={['*']}
        source={{ html }}
        javaScriptEnabled
        // The attribution links open in a new window; don't let them replace the map.
        setSupportMultipleWindows={false}
        // Only "open" messages from the map page are acted on (readMapMessage).
        onMessage={(e) => {
          const msg = readMapMessage(e.nativeEvent.data);
          if (msg && props.onOpen) props.onOpen(msg.id);
        }}
        style={{ backgroundColor: theme.color.bg.muted }}
      />
    </View>
  );
}
