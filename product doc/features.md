This is an essential operational feature for Nigeria, where many gate attendants and security personnel either have feature phones, no data for Google Maps, or rely on voice calls to find commercial lots, plazas, and depots.

Here is the architectural design to solve this cleanly:

1. Where the Lot Phone Number Lives
Data Schema (packages/contracts/src/lots.ts & API Store):
Add contactPhone: z.string().min(7).max(30).optional() to the Lot schema.
Lot Settings in Portal (/lots/[lotId]):
Add a dedicated field: "Gatehouse / Lot Contact Phone" (e.g., +234 803 123 4567).
Helper description: "Contact number for attendants and drivers to call for voice directions or gate inquiries."
2. How the Admin Shares It with the Attendant
3. Attendant Experience & Touchpoints

WhatsApp Invite Message: When the admin clicks "Share on WhatsApp" after creating the attendant invite, the generated message includes the phone number:

"Hello Musa, you have been assigned as an attendant for Eko Parking (Victoria Island) on Parkly.
📍 Address: 12 Adeola Odeku St, VI, Lagos
📞 Need directions? Call the lot gatehouse: +234 803 123 4567
🔑 Gate App Link: https://parkly.ng/invite/xyz-123
"

In the Attendant App (/attend):

At the top of the lot screen / shift view, a "Lot Gatehouse: +234..." pill with a tel: link allows 1-tap calling if the attendant is arriving, lost, or needs gate supervisor assistance.

Team Management View (/team):

Under the attendant's assigned lots, display the lot's contact phone number with a quick "Copy Directions & Phone" button for the admin.
Ready to Implement

We can implement this alongside the offline driver plate/phone gate lookup:

Add contactPhone to Lot Schema & Database (contracts, Drizzle, and Memory store).
Add Lot Phone input in Lot Management UI (apps/portal).
Update Attendant WhatsApp Invite & Team Cards to include the lot's contact phone for voice directions.
Display the Tap-to-Call Contact Phone in the /attend App.