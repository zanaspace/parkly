1. The Direct Answer: Which is the Marketing Website?
apps/web (parkly.ng) is designed to be BOTH the public marketing website AND the driver web portal.

In modern mobility and booking platforms (like SpotHero, Airbnb, Uber, and PayByPhone), separating the marketing website from the booking engine hurts SEO and creates friction. Instead, the root homepage (parkly.ng) serves as the marketing landing page, with an embedded instant search bar right in the hero section.

2. The Domain Architecture
Domain	App Folder	Purpose & Audience
parkly.ng	apps/web	Public Marketing & Driver Web Portal
• High-converting marketing landing page
• Instant parking search & public lot pages (SEO)
• Mobile app download links (Play Store / App Store)
• Cashless web booking & QR ticket view
• Inbound B2B leads ("Partner with us" / "Corporate parking")
portal.parkly.ng	apps/portal	B2B Operator Portal & Attendant App
• Operator sign-up, KYB & bank onboarding
• Lot creation, LASPA permits & rate plans
• Live occupancy dashboard & financials
• Mobile-optimized Gate Attendant PWA (/attend)
admin.parkly.ng	apps/admin	Parkly Internal Ops & Compliance
• Staff console (lot verification, KYB approvals, dispute handling, audits)
3. Why Using apps/web for Marketing is the Best Way Forward
Massive SEO Advantage: When someone in Lagos searches Google for "Safe parking in Victoria Island" or "Parking near Eko Hotel", Google will rank your public lot pages (parkly.ng/lots/eko-hotel-lot) and area hubs (parkly.ng/search?area=vi). If marketing is isolated on a separate site or CMS, you lose that organic search traffic.
Zero Booking Drop-off: A visitor doesn't have to click "Go to App" to see if parking is available. They can type "Marina" or "Admiralty Way" right on the homepage hero, see real lots, prices, and availability immediately.
Dual Funnel (Drivers + Operators + Corporates): A single marketing homepage can funnel:
Drivers: Search instantly or download the Android/iOS app.
Lot Owners / Operators: Clear CTA: "Own a car park in Lagos? Turn empty spaces into guaranteed income with Parkly" → links to portal.parkly.ng/sign-up.
Corporate Employers: "Reserve dedicated parking for your company staff & fleet" → links to B2B contact/corporate pass inquiry.
Design Consistency & Speed: apps/web already uses your unified @parkly/tokens design system, responsive components, and custom dark/light theme tokens. You avoid having to maintain an external WordPress or Webflow site.
4. What Is the Current State vs. What Needs to Be Upgraded?
Right now, apps/web/app/page.tsx has a functional MVP skeleton (search box, 3 simple text bullets, and 6 area chips). It works, but it does not yet look like a premium, consumer-facing tech product.

To make apps/web a true marketing engine that builds trust and drives downloads/bookings, we should elevate the homepage into a modern landing page:

Hero Section:
Punchy value proposition: "Never stress about parking in Lagos again."
Instant search widget (Destination, Date, Time, Search button).
Prominent "Download on Google Play" and "App Store" mobile app download badges.
Trust & Safety Section (The LASPA Advantage):
Highlight the Verified Parking Guarantee (LASPA registered, gated security, CCTV, verified attendants, zero street-tout harassment).
"How Parkly Works" (3-Step Visual Cards):
Find & Reserve — Search verified lots and lock your space with transparent pricing.
Navigate & Arrive — Turn-by-turn directions directly to the gate.
Scan & Park — Cashless QR check-in in under 10 seconds.
Hotspots & Popular Destinations in Lagos:
Visual cards for top commercial hubs with starting hourly rates: Victoria Island, Lekki Phase 1, Marina / CMS, Ikoyi, Ikeja GRA.
Operator Recruitment Banner (B2B Supply):
"Monetize your parking spaces. Zero hardware required. Parkly provides verified attendants, cashless digital ticketing, and daily bank payouts." → CTA to Operator Portal.
Corporate & Fleet Banner (B2B Demand):
"Corporate parking for company staff and executive fleets on a single monthly invoice."
FAQ & Social Proof / Guarantees:
Common driver questions (Overstay rules, cancellations, security, accepted cards/transfers).
5. Recommended Way Forward
Keep apps/web as the single marketing and driver web platform. No need for a separate marketing domain.
Elevate apps/web's homepage (page.tsx) to incorporate the rich visual sections above (interactive hero, app download badges, operator partner CTA, corporate CTA, and FAQ).
Continue with Sprint 6 to build out the full session lifecycle (in-app extension, overstay pricing, cancellations, and receipts).