'use client';

import 'maplibre-gl/dist/maplibre-gl.css';
import {
  LngLatBounds,
  Map as MapLibreMap,
  Marker,
  NavigationControl,
  setWorkerUrl,
} from 'maplibre-gl';
import { useEffect, useRef } from 'react';

/** OpenFreeMap vector style (ADR 0014): free, no key. */
export const MAP_STYLE = 'https://tiles.openfreemap.org/styles/liberty';

// Served from public/ (copied there by scripts/copy-maplibre-worker.mjs).
setWorkerUrl('/maplibre/maplibre-gl-worker.mjs');

export type MapPin = {
  id: string;
  lat: number;
  lng: number;
  /** Short text on the pin, e.g. the total price. */
  label: string;
  /** Where the pin links to. */
  href?: string;
  /** Accessible name for the pin. */
  title: string;
};

/**
 * D-12 map view: one labelled pin per car park, the searched point, and a
 * fit to all of them. Pins are links, so the list below stays the accessible
 * way through the results.
 */
export function LotsMap(props: {
  pins: MapPin[];
  centre: { lat: number; lng: number };
  /** Show the searched point as a dot (results); off on a lot page. */
  showCentre?: boolean;
  height?: string;
}) {
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!box.current) return;
    const map = new MapLibreMap({
      container: box.current,
      style: MAP_STYLE,
      center: [props.centre.lng, props.centre.lat],
      zoom: 14,
      attributionControl: { compact: true },
      cooperativeGestures: true,
    });
    map.addControl(new NavigationControl({ showCompass: false }), 'top-right');

    if (props.showCentre) {
      const dot = document.createElement('div');
      dot.className = 'pk-map-centre';
      dot.setAttribute('aria-hidden', 'true');
      new Marker({ element: dot }).setLngLat([props.centre.lng, props.centre.lat]).addTo(map);
    }

    const bounds = new LngLatBounds();
    bounds.extend([props.centre.lng, props.centre.lat]);
    for (const pin of props.pins) {
      const el = document.createElement(pin.href ? 'a' : 'div');
      el.className = 'pk-map-pin';
      el.textContent = pin.label;
      el.setAttribute('title', pin.title);
      el.setAttribute('aria-label', pin.title);
      if (pin.href && el instanceof HTMLAnchorElement) el.href = pin.href;
      new Marker({ element: el, anchor: 'bottom' }).setLngLat([pin.lng, pin.lat]).addTo(map);
      bounds.extend([pin.lng, pin.lat]);
    }
    if (props.pins.length > 0) map.fitBounds(bounds, { padding: 48, maxZoom: 16, duration: 0 });

    return () => map.remove();
  }, [props.pins, props.centre, props.showCentre]);

  return (
    <div
      ref={box}
      className="pk-map"
      style={{ height: props.height ?? '20rem' }}
      role="region"
      aria-label="Map of car parks"
    />
  );
}
