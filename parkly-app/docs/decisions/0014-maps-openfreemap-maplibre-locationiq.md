# 0014 — Maps: OpenFreeMap + MapLibre for maps, LocationIQ for address search

- **Status:** Accepted
- **Date:** 2026-10-22
- **Deciders:** Product owner, engineering lead
- **Supersedes:** the "Maps / geocoding: Google Maps Platform" line of doc 00 §3
- **Related:** doc 00 §3, doc 01 (context diagram, caching), doc 02 §6.3 (`/places/*`), PRD FR-LOT-101, ADR 0002

## Context

Doc 00 chose Google Maps Platform (Places Autocomplete, Geocoding, Maps SDK). To use it, Google requires a billing account; for Nigerian accounts it asked for a **prepayment up front** (2026-10-22). The pilot needs a map of results and type-ahead address search (FR-LOT-101) without that commitment.

Constraints: no spend before the pilot proves demand; works on the website and in the app, including Expo Go (no custom native modules during development); every external service behind an interface with a fake (AGENTS.md §3); keys never in clients except restricted, public ones.

## Options considered

| Option | Map | Address search | Cost / account |
|---|---|---|---|
| Google Maps Platform | Maps JS + Maps SDK | Places Autocomplete | Billing account, prepayment in Nigeria |
| Mapbox | GL JS / native SDK | Search Box API | Account, card may be required |
| MapTiler | MapLibre styles | Geocoding API | Free tier, account |
| **OpenFreeMap + MapLibre, LocationIQ** | MapLibre GL with OpenFreeMap vector tiles | LocationIQ Autocomplete (OpenStreetMap) | Map: free, no account, no key. Search: free tier, account, no card |
| Nominatim (OpenStreetMap) | — | Search, no type-ahead | Free, strict light-use policy; unsuitable for an app |

## Decision

1. **Maps:** MapLibre GL JS with the OpenFreeMap "liberty" style (`https://tiles.openfreemap.org/styles/liberty`) on the website, and the same inside a WebView in the app (works in Expo Go; a native MapLibre module can replace it later). No key, no account.
2. **Address search:** LocationIQ Autocomplete, called **only by the API** (`GET /v1/places/autocomplete`) through `MapsProvider`, restricted to Nigeria and Lagos State. The key (`LOCATIONIQ_API_KEY`) is a server secret on Vercel; clients never see it.
3. **Attribution:** maps show the OpenStreetMap / OpenFreeMap attribution MapLibre adds; search results are OpenStreetMap data (ODbL).
4. **Google stays a drop-in:** `MapsProvider` keeps a place-details step so a Google adapter can be added later without changing clients.

## Consequences

- No spend for maps during the pilot. LocationIQ's free daily allowance covers expected pilot search volume; the API rate-limits searches per IP and the clients wait for typing to pause (300 ms) before asking.
- OpenStreetMap is good for Lagos landmarks, streets and areas, weaker than Google for small businesses and exact building numbers. Area chips and "Near me" remain.
- OpenFreeMap is a free community service without an SLA. If it becomes unreliable, switch the style URL to MapTiler or self-host tiles; no code changes beyond configuration.
- Doc 00 §3, doc 01 and doc 02 §6.3 are updated in the same change.
