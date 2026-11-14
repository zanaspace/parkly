# Sprint CORP-06: Employee Mobile Pass, VIP Visitors & Enterprise Pilot

## 1-Tap Workplace Pass, VIP Guest Invitations, Enterprise Rollout Kit & k6 Scale Verification

**Sprint ID:** `CORP-06`  
**Parent Program:** Parkly Corporate (`parkly-app/corporateParking/`)  
**Status:** Ready to Implement  
**Dependencies:** SPRINT CORP-01 through SPRINT CORP-05, S10 (Pilot Launch Readiness)

---

## 1. Objectives & Scope

Sprint CORP-06 completes the employee-facing interface and enterprise pilot readiness:

1. **The Employee Mobile Pass (`https://<companySlug>.parkly.ng/` & Mobile App):**
   - 1-tap "Workplace Pass" available in the Parkly Mobile App and standard mobile web browser.
   - Live QR code, assigned workplace bay number, and parking zone directions.
   - ₦0 charged to the employee at gate entry or exit.
2. **VIP Guest & Visitor Self-Booking Flow:**
   - Employees can generate visitor parking links via WhatsApp, SMS, or email: _"Here is your VIP parking pass for your meeting at Zenith Bank Head Office tomorrow."_
   - Real-time notification when the visitor arrives at the security gate.
3. **Enterprise Pilot Rollout Kit:**
   - 1-page laminated quick reference guide for gate security guards.
   - Employee onboarding email templates and FAQ guide.
   - k6 load testing suite simulating enterprise rush-hour arrival traffic (500 cars in 30 minutes).

### Core Deliverables

1. **Employee Workplace Dashboard (`https://<companySlug>.parkly.ng/`):**
   - Displays company brand banner, employee name, assigned vehicle plate, and active pass status.
   - 1-tap "Show Gate QR" button with high-contrast brightness boost for scanner readability.
2. **VIP Visitor Invitation Modal:**
   - Form capturing guest name, phone, plate, date, and arrival time window.
   - Generates signed cryptographic QR pass sent directly to the visitor's phone.
3. **Enterprise 30-Day Pilot Playbook:**
   - Deployment checklist for multi-storey corporate towers in Victoria Island and Marina.
   - Security guard shift training materials.
4. **k6 Enterprise Rush-Hour Load Test (`tests/load/k6-corporate-load.js`):**
   - Simulates 500 simultaneous employee gate verifications between 7:30 AM and 8:30 AM with p95 `< 1,000ms`.

---

## 2. Detailed Technical Specifications

### 2.1 VIP Visitor Pass Generation

```typescript
export async function createCorporateVisitorPass(input: {
  corporateId: string;
  hostUserId: string;
  visitorName: string;
  visitorPhone: string;
  plateNumber: string;
  visitDate: string;
  isVip: boolean;
}) {
  const token = await signQrPayload({
    t: 'V', // Visitor
    c: input.corporateId,
    p: normalizePlate(input.plateNumber),
    d: input.visitDate,
  });

  const pass = await store.createVisitorPass({ ...input, tokenCode: token });

  // Send WhatsApp/SMS invitation
  await smsService.send(input.visitorPhone, {
    message: `You have a VIP parking pass for your visit to ${input.corporateId} on ${input.visitDate}. Open your pass here: https://${input.corporateId}.parkly.ng/v/${pass.id}`,
  });

  return pass;
}
```

---

## 3. Tasks Breakdown

- [ ] **Task 1: Employee Workplace Mobile View (`/`)**
  - Design and build mobile-first dashboard displaying corporate branding, vehicle plate, and 1-tap pass QR.
- [ ] **Task 2: VIP Visitor Booking Modal**
  - Implement visitor pass creation modal accessible by authorized staff.
  - Send SMS/email with branded visitor ticket link.
- [ ] **Task 3: Security Guard Laminated Quick Reference Guide**
  - Create `docs/operations/corporate-guard-field-guide.md` with visual color codes and emergency overrides.
- [ ] **Task 4: Employee Onboarding Email Kit**
  - Create corporate communication template explaining how employees claim their ₦0 parking pass.
- [ ] **Task 5: k6 Enterprise Rush-Hour Load Test**
  - Implement `tests/load/k6-corporate-load.js` simulating 500 concurrent car check-ins.
  - Verify p95 response time is strictly under 1.0 second.
- [ ] **Task 6: Monorepo CI Gates & Verification**
  - Ensure all packages typecheck, lint, and build cleanly.

---

## 4. Verification & Exit Criteria

1. Employee can open `<companySlug>.parkly.ng/` on their phone and display a valid Corporate Pass with ₦0 charge.
2. Employee can send a VIP parking pass to a client via SMS; client scans at gate and security guard receives Green signal.
3. k6 load test proves 500 rush-hour check-ins execute with zero overbooking and p95 `< 1,000ms`.
4. Monorepo CI checks pass cleanly.
