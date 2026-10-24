The PRD expects real Google Maps in Sprint 3. It doesn't mention a stand-in.

What the documents say:

- PRD FR-LOT-101 (search by destination, priority P0, a launch must-have):
▎ "Places autocomplete or 'near me'; returns LIVE lots within 2 km (expandable to 5 km) with price…, availability, distance, verified badge; list + map."
- PRD §12, Dependencies:

| Dependency                                                  | Needed for | Needed by |
|-------------------------------------------------------------|------------|-----------|
| Google Maps Platform (billing account, API keys restricted) | FR-LOT-101 | S3        |

- Doc 00, which wins every conflict: the maps provider is fixed as Google Maps Platform (Places Autocomplete, Geocoding, Maps SDK for Android/JS).
- Doc 20 Sprint 0, task 14: "start external accounts… Google Maps keys". It should have been requested back in Sprint 0, which we carried over.
- Doc 20 Sprint 3, task 4: "Google Places autocomplete proxied via API (key never in client for server calls; Android key restricted by package/SHA)".
- Where the stand-in comes from: AGENTS.md and doc 01 say every external service sits behind an interface with a fake for tests and local dev. A fake MapsProvider already exists in the code, seeded with Victoria Island. It's meant for tests, not as the dev-site experience.

What that means for the choice:
- The plan expects the real key during Sprint 3, and the Sprint 3 demo ("driver searches 'Eko Hotel'…") needs real address search.
- But not all of Sprint 3 needs the key: the pricing engine, available spaces, search by distance, the lot page and the seed data can all be built first using the fake.

My recommendation: do both in parallel. You create the Google key now, since billing setup can take a day. Meanwhile I start Sprint 3 with the parts that don't need it, and plug the key in once you have it. That follows the PRD and doesn't block either of us.

To create the key (about 15 minutes; Google asks for a card, but there's a free monthly allowance for dev use):

1. Go to https://console.cloud.google.com and create a project named parkly-dev.
2. Go to Billing and link a billing account.
3. Go to APIs & Services → Library and enable:
   - Places API (New): address search
   - Geocoding API: address → map point
   - Maps JavaScript API: map on the website
   - Maps SDK for Android: map in the app
4. Go to APIs & Services → Credentials and create two keys.

   Server key, used only by the API:
   - Application restriction: None. Vercel has no fixed IP address, so the key is kept secret on the server instead.
   - API restrictions: Places API (New) and Geocoding API only.
   - You'll add it to Vercel (parkly-api) as GOOGLE_MAPS_SERVER_KEY, marked Sensitive. Don't paste it here.

   Browser key, used for the map on the website (it's visible in the page, so it's locked down instead):
   - Application restriction: Websites, with https://parkly-web-two.vercel.app/* and http://localhost:3000/*.
   - API restrictions: Maps JavaScript API only.
5. In Billing → Budgets & alerts, set a budget alert (for example $10/month) so there are no surprises.

The Android map key comes later, when we make a signed Android build.

Shall I start Sprint 3 now with the parts that don't need the key?
