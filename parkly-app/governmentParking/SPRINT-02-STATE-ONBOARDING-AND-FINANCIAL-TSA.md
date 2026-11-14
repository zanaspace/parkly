# Sprint GOV-02: Institutional State Onboarding, KYG & TSA Split Engine

## Verifiable Government Onboarding, Subaccount Binding & Remita/Paystack TSA Split Settlement

**Sprint ID:** `GOV-02`  
**Parent Program:** Parkly GovTech (`parkly-app/governmentParking/`)  
**Status:** Ready to Implement  
**Dependencies:** SPRINT GOV-01, S4 (Payments & Ledger)

---

## 1. Objectives & Scope

Sprint GOV-02 builds the official onboarding and settlement infrastructure for State Governments. Unlike private commercial operators who undergo standard corporate KYB, State Governments require institutional **KYG (Know Your Government)** verification, Executive Order/Gazette document authentication, and direct integration with the State Treasury Single Account (TSA).

### Core Deliverables

1. **Ultra-Simple State Onboarding Wizard (`https://<stateSlug>.parkly.ng/onboard`):**
   - Built specifically for non-tech savvy public servants and coordinators with progressive, plain-English steps:
     1. _Who is Onboarding:_ Select State Government & Ministry/Agency, enter Lead Officer contact, and upload Executive Order or Gazette.
     2. _Settlement Account Setup:_ Enter Bank & Account Number (auto-resolves bank name and account name via NUBAN lookup) or enter Remita TSA Service Type ID (RRR).
     3. _Review & Provision:_ One-tap submission generating dedicated sovereign URL (`<stateSlug>.parkly.ng`), assigning initial credentials, and providing printable setup guides.
   - Built-in live progress stepper, plain-language tooltips, and WhatsApp/phone onboarding concierge support link.
2. **State TSA & Financial Subaccount Schema (`packages/db`):**
   - `state_tsa_accounts`: Subaccount records (Bank name, Account number, Sort code, Remita Service Type ID / Paystack Subaccount Code, settlement schedule: T+0 or T+1).
   - `state_settlement_rules`: Automated revenue allocation rules defining percentage/fixed splits:
     $$\text{Gross Payment} = \text{State TSA (e.g. 75\%)} + \text{Parastatal Maintenance (e.g. 15\%)} + \text{Parkly Tech Fee (e.g. 10\%)}$$
3. **Automated Split Payment & Settlement Processor:**
   - Multi-party split engine executing at point of citizen payment.
   - Double-entry ledger integration creating immutable credit entries for `STATE_TSA_CONSOLIDATED_REVENUE` and `PARASTATAL_FACILITY_MAINTENANCE`.
4. **KYG Verification & Super-Admin Review Console:**
   - Review workflow in Parkly Admin (`/admin/gov/verifications`) to verify gazetted letters, state seal, and subaccount ownership before state activation.

---

## 2. Detailed Technical Specifications

### 2.1 Database Schema (`packages/db/src/schema/government_finance.ts`)

```typescript
import { pgTable, text, timestamp, boolean, integer, jsonb, uuid } from 'drizzle-orm/pg-core';
import { governmentStates } from './government';

export const stateTsaAccounts = pgTable('state_tsa_accounts', {
  id: uuid('id').primaryKey().defaultRandom(),
  stateId: text('state_id')
    .notNull()
    .references(() => governmentStates.id, { onDelete: 'cascade' }),
  provider: text('provider').notNull(), // "REMITA_TSA" | "PAYSTACK_SPLIT" | "INTERSWITCH"
  subaccountCode: text('subaccount_code').notNull(), // e.g. "ACCT_remita_tsa_12345"
  bankCode: text('bank_code').notNull(),
  bankName: text('bank_name').notNull(),
  accountNumber: text('account_number').notNull(),
  accountName: text('account_name').notNull(),
  remitaServiceTypeId: text('remita_service_type_id'),
  settlementFrequency: text('settlement_frequency').notNull().default('DAILY'), // "INSTANT" | "DAILY"
  isVerified: boolean('is_verified').notNull().default(false),
  verifiedAt: timestamp('verified_at', { withTimezone: true }),
  verifiedBy: text('verified_by'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const stateSettlementRules = pgTable('state_settlement_rules', {
  id: uuid('id').primaryKey().defaultRandom(),
  stateId: text('state_id')
    .notNull()
    .references(() => governmentStates.id, { onDelete: 'cascade' }),
  mdaId: text('mda_id'), // Optional MDA override, null = state default
  stateTsaShareBasisPoints: integer('state_tsa_share_basis_points').notNull().default(7500), // 75.00%
  mdaShareBasisPoints: integer('mda_share_basis_points').notNull().default(1500), // 15.00%
  techFeeBasisPoints: integer('tech_fee_basis_points').notNull().default(1000), // 10.00%
  effectiveFrom: timestamp('effective_from', { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const stateKygDocuments = pgTable('state_kyg_documents', {
  id: uuid('id').primaryKey().defaultRandom(),
  stateId: text('state_id')
    .notNull()
    .references(() => governmentStates.id, { onDelete: 'cascade' }),
  docType: text('doc_type').notNull(), // "EXECUTIVE_ORDER", "GAZETTE", "APPOINTMENT_LETTER", "TSA_MANDATE"
  fileUrl: text('file_url').notNull(),
  fileHash: text('file_hash').notNull(),
  status: text('status').notNull().default('PENDING'), // "PENDING", "APPROVED", "REJECTED"
  reviewNote: text('review_note'),
  reviewedBy: text('reviewed_by'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
```

### 2.2 Split Settlement Algorithm

```typescript
export function calculateGovernmentSplit(grossAmountKobo: number, rules: StateSettlementRule) {
  const stateShareKobo = Math.round((grossAmountKobo * rules.stateTsaShareBasisPoints) / 10000);
  const mdaShareKobo = Math.round((grossAmountKobo * rules.mdaShareBasisPoints) / 10000);
  const techFeeKobo = grossAmountKobo - stateShareKobo - mdaShareKobo;

  return {
    grossAmountKobo,
    stateTsaShareKobo: stateShareKobo,
    mdaMaintenanceShareKobo: mdaShareKobo,
    techFeeKobo: techFeeKobo,
  };
}
```

---

## 3. Tasks Breakdown

- [ ] **Task 1: Government Finance Schema & Migrations**
  - Define `state_tsa_accounts`, `state_settlement_rules`, and `state_kyg_documents`.
  - Add migrations to `packages/db`.
- [ ] **Task 2: State Onboarding Wizard Frontend**
  - Implement dynamic multi-step form at `apps/portal/app/government/[stateSlug]/onboard/page.tsx`.
  - Validate state executive credentials, document uploads (PDF gazette), and settlement account numbers with NUBAN checksum.
- [ ] **Task 3: Remita RRR & Paystack Split Subaccount Integration**
  - Integrate Remita TSA API client and Paystack Subaccount API for government settlement accounts.
  - Implement test mock verification endpoint for local dev/testing.
- [ ] **Task 4: Three-Way Ledger Split Engine**
  - Hook into booking payment journal (`packages/domain/src/booking/ledger.ts`) to support `GOVERNMENT_SPLIT` transaction types.
  - Verify zero-kobo rounding leakage via unit tests.
- [ ] **Task 5: Admin KYG Review Console**
  - Add `/admin/gov/kyg` screen in `apps/admin` allowing Parkly compliance team to inspect state legal documents, verify NUBAN TSA details, and activate the State.
- [ ] **Task 6: Verification Tests & CI Gates**
  - End-to-end integration tests verifying state onboarding submission, document upload, admin approval, and split calculation.

---

## 4. Verification & Exit Criteria

1. A state government representative can complete `/onboard` with document upload.
2. Parkly Admin can approve the state's KYG application and verify its TSA subaccount.
3. Split calculation unit tests prove exact kobo math matching:
   $$\text{State Share} + \text{MDA Share} + \text{Tech Fee} \equiv \text{Gross Payment}$$
4. All CI checks pass cleanly (`pnpm typecheck`, `pnpm test`).
