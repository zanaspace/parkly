import { describe, expect, it } from 'vitest';
import { mapHtml, readMapMessage } from './map-html';

const colors = { pinBg: '#0a5', pinFg: '#fff', centre: '#06f', canvas: '#eee' };

describe('map page for the WebView', () => {
  it('pins MapLibre with integrity hashes and uses the OpenFreeMap style', () => {
    const html = mapHtml({ pins: [], centre: { lat: 6.43, lng: 3.42 }, showCentre: true, colors });
    expect(html).toContain('maplibre-gl@5.24.0/dist/maplibre-gl.js" integrity="sha384-');
    expect(html).toContain('maplibre-gl.css" integrity="sha384-');
    expect(html).toContain('"https://tiles.openfreemap.org/styles/liberty"');
  });

  it('embeds pins so a name or label can never close the script tag', () => {
    const html = mapHtml({
      pins: [{ id: 'a', lat: 6.4, lng: 3.4, label: '</script><script>alert(1)</script>' }],
      centre: { lat: 6.43, lng: 3.42 },
      showCentre: false,
      colors,
    });
    expect(html).not.toContain('</script><script>alert(1)');
    expect(html).toContain('\\u003c/script>');
  });

  it('accepts only "open" messages with an id', () => {
    expect(readMapMessage('{"type":"open","id":"lot-1"}')).toEqual({ type: 'open', id: 'lot-1' });
    expect(readMapMessage('{"type":"other"}')).toBeNull();
    expect(readMapMessage('not json')).toBeNull();
  });
});
