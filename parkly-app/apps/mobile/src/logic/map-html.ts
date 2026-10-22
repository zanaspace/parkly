/**
 * The map page shown inside a WebView (ADR 0014): MapLibre with OpenFreeMap
 * tiles, no key. A WebView keeps it working in Expo Go; a native MapLibre
 * module can replace it later. Pins post a message back to the app.
 */

export type MapPin = { id: string; lat: number; lng: number; label: string };

const MAPLIBRE = 'https://unpkg.com/maplibre-gl@5.24.0/dist';
// Subresource integrity: the WebView refuses the files if the CDN copy changes.
const JS_SRI = 'sha384-5+cfbwT0iiub6VsQAdn6yz16nr6sDiQoHx6tm4O8OVYXHYOxcffFmCJBL0dgdvGp';
const CSS_SRI = 'sha384-uTttxo/aOKbdE5RlD/SPzSDoDmNvGlUYPjONi2MN/b7c9HPSvW07OIuyP7uL6jxK';
export const MAP_STYLE = 'https://tiles.openfreemap.org/styles/liberty';

/** JSON safe to embed in a <script>: `<` can't close the tag. */
const embed = (value: unknown) => JSON.stringify(value).replace(/</g, '\\u003c');

export function mapHtml(input: {
  pins: MapPin[];
  centre: { lat: number; lng: number };
  showCentre: boolean;
  colors: { pinBg: string; pinFg: string; centre: string; canvas: string };
}): string {
  return `<!doctype html>
<html><head>
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1">
<link rel="stylesheet" href="${MAPLIBRE}/maplibre-gl.css" integrity="${CSS_SRI}" crossorigin="anonymous">
<style>
  html, body, #map { margin: 0; height: 100%; background: ${input.colors.canvas}; }
  .pin { padding: 2px 8px; border-radius: 999px; font: 700 13px system-ui, sans-serif;
         background: ${input.colors.pinBg}; color: ${input.colors.pinFg}; white-space: nowrap;
         box-shadow: 0 1px 3px rgba(0,0,0,.3); }
  .centre { width: 14px; height: 14px; border-radius: 50%; background: ${input.colors.centre};
            border: 2px solid #fff; }
</style>
</head><body>
<div id="map"></div>
<script src="${MAPLIBRE}/maplibre-gl.js" integrity="${JS_SRI}" crossorigin="anonymous"></script>
<script>
  var pins = ${embed(input.pins)};
  var centre = ${embed(input.centre)};
  var map = new maplibregl.Map({ container: 'map', style: ${embed(MAP_STYLE)},
    center: [centre.lng, centre.lat], zoom: 14, attributionControl: { compact: true } });
  var bounds = new maplibregl.LngLatBounds();
  bounds.extend([centre.lng, centre.lat]);
  if (${input.showCentre ? 'true' : 'false'}) {
    var dot = document.createElement('div'); dot.className = 'centre';
    new maplibregl.Marker({ element: dot }).setLngLat([centre.lng, centre.lat]).addTo(map);
  }
  pins.forEach(function (p) {
    var el = document.createElement('div'); el.className = 'pin'; el.textContent = p.label;
    el.addEventListener('click', function () {
      window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'open', id: p.id }));
    });
    new maplibregl.Marker({ element: el, anchor: 'bottom' }).setLngLat([p.lng, p.lat]).addTo(map);
    bounds.extend([p.lng, p.lat]);
  });
  if (pins.length > 1) map.fitBounds(bounds, { padding: 40, maxZoom: 16, duration: 0 });
</script>
</body></html>`;
}

/** Reads a message from the map page; anything unexpected is ignored. */
export function readMapMessage(data: string): { type: 'open'; id: string } | null {
  try {
    const m = JSON.parse(data) as { type?: unknown; id?: unknown };
    return m.type === 'open' && typeof m.id === 'string' ? { type: 'open', id: m.id } : null;
  } catch {
    return null;
  }
}
