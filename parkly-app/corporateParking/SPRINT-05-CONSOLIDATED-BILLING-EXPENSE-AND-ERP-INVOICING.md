# Sprint CORP-05: Consolidated Billing, VAT & ERP Expense Invoicing

## Automated Monthly E-Invoicing, 7.5% VAT Compliance, Cost-Center Budgeting & ERP Export Journals

**Sprint ID:** `CORP-05`  
**Parent Program:** Parkly Corporate (`parkly-app/corporateParking/`)  
**Status:** Ready to Implement  
**Dependencies:** SPRINT CORP-01, SPRINT CORP-02, S4 (Payments & Ledger), S7 (Operator Ledger)

---

## 1. Objectives & Scope

Sprint CORP-05 automates corporate financial accounting. Instead of hundreds of employees submitting paper expense receipts for parking reimbursements, all corporate parking activity aggregates into a single, tax-deductible monthly corporate invoice with departmental cost-center itemization.

### Core Deliverables

1. **Consolidated Monthly Corporate Invoicing (`https://<companySlug>.parkly.ng/finance`):**
   - Automated 1st-of-the-month billing run:
     $$\text{Gross Invoice} = \sum (\text{Staff Passes} + \text{Fleet Parking Hours} + \text{VIP Visitor Passes}) + 7.5\% \text{ VAT}$$
   - Itemized PDF e-invoice with corporate Tax Identification Number (TIN), official VAT breakdown, and Withholding Tax (WHT) deduction schedule.
2. **Departmental Cost-Center Budgeting:**
   - Multi-cost-center allocation: Assign expenses to departments (e.g. Sales, Investment Banking, Legal, Logistics).
   - Automated spending caps: Alert HR and Finance when a cost centre approaches 80% and 100% of its monthly parking budget.
3. **Flexible B2B Settlement Gateways:**
   - Paystack Corporate Direct Debit / Card Recurring Authorization.
   - Dedicated Corporate Virtual Account (Instant NIP Bank Transfer to unique NUBAN account with zero manual reconciliation).
4. **ERP Accounting Export Journals:**
   - One-click export of structured General Ledger (GL) journal entries compatible with:
     - SAP ERP
     - Oracle NetSuite
     - Microsoft Dynamics 365
     - QuickBooks & Xero

---

## 2. Detailed Technical Specifications

### 2.1 Corporate Billing Schema (`packages/db/src/schema/corporate_billing.ts`)

```typescript
import { pgTable, text, timestamp, boolean, integer, jsonb, uuid } from 'drizzle-orm/pg-core';
import { corporateAccounts, corporateCostCenters } from './corporate';

export const corporateInvoices = pgTable('corporate_invoices', {
  id: uuid('id').primaryKey().defaultRandom(),
  corporateId: text('corporate_id')
    .notNull()
    .references(() => corporateAccounts.id, { onDelete: 'cascade' }),
  invoiceNumber: text('invoice_number').notNull().unique(), // e.g. "PKL-CORP-2026-11-0042"
  billingPeriodMonth: text('billing_period_month').notNull(), // "2026-11"
  subtotalAmountKobo: integer('subtotal_amount_kobo').notNull(),
  vatAmountKobo: integer('vat_amount_kobo').notNull(), // 7.5% VAT
  totalAmountKobo: integer('total_amount_kobo').notNull(),
  status: text('status').notNull().default('PENDING'), // "PENDING", "PAID", "OVERDUE", "VOID"
  dueDate: timestamp('due_date', { withTimezone: true }).notNull(),
  paidAt: timestamp('paid_at', { withTimezone: true }),
  paymentReference: text('payment_reference'),
  pdfUrl: text('pdf_url'),
  costCenterBreakdown: jsonb('cost_center_breakdown').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const corporateCostCenterBudgets = pgTable('corporate_cost_center_budgets', {
  id: uuid('id').primaryKey().defaultRandom(),
  costCenterId: uuid('cost_center_id')
    .notNull()
    .references(() => corporateCostCenters.id, { onDelete: 'cascade' }),
  periodMonth: text('period_month').notNull(), // "2026-11"
  allocatedBudgetKobo: integer('allocated_budget_kobo').notNull(),
  spentAmountKobo: integer('spent_amount_kobo').notNull().default(0),
  isHardCap: boolean('is_hard_cap').notNull().default(false),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
```

### 2.2 7.5% Nigerian VAT Calculation

```typescript
export function computeCorporateInvoiceTotal(subtotalKobo: number) {
  const vatRate = 0.075; // 7.5% VAT
  const vatKobo = Math.round(subtotalKobo * vatRate);
  const totalKobo = subtotalKobo + vatKobo;
  return { subtotalKobo, vatKobo, totalKobo };
}
```

---

## 3. Tasks Breakdown

- [ ] **Task 1: Billing Schema & Migrations**
  - Add tables `corporate_invoices` and `corporate_cost_center_budgets` to `packages/db`.
  - Produce migration with `pnpm db:generate`.
- [ ] **Task 2: Monthly Invoice Generator Job**
  - Implement scheduled job (`pg_cron` / Node worker) running at 00:00 on the 1st of each month to compute parking charges and generate PDF invoices.
- [ ] **Task 3: Finance Console UI (`/finance`)**
  - Implement finance dashboard with invoice history, payment status, and one-click PDF download.
  - Implement cost-center budget bar charts showing departmental spend vs allocations.
- [ ] **Task 4: ERP Export Engine**
  - Generate CSV journal entries with standard debit/credit columns (`Account Code`, `Cost Center`, `Debit`, `Credit`, `Description`).
- [ ] **Task 5: Unit & Financial Calculation Tests**
  - Verify exact kobo math matching: `Subtotal + VAT === Total`.
  - Test budget threshold alerts.

---

## 4. Verification & Exit Criteria

1. Automated monthly invoice generation creates PDF with exact 7.5% VAT.
2. Departmental cost-center reports accurately reflect staff parking usage.
3. Corporate accountant can download ERP-ready CSV journal entries.
4. Monorepo CI checks pass cleanly.
