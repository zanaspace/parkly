import { z } from 'zod';

export const LagosDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD');
export const LagosMonthSchema = z.string().regex(/^\d{4}-\d{2}$/, 'Use YYYY-MM');

/** Maximum window for revenue reports (FR-OPS-003). */
export const OPERATOR_REPORT_MAX_DAYS = 93;
export const OPERATOR_REPORT_EXPORT_MAX_ROWS = 10_000;

export const OperatorEarningsQuerySchema = z.object({
  from: LagosDateSchema,
  to: LagosDateSchema,
  lotId: z.uuid().optional(),
});

/**
 * What drivers paid and who keeps it, read from the ledger, net of refunds.
 * Extension and overstay are parts of gross (before refunds), not added to it.
 */
const EarningsAmountsShape = {
  /** Bookings first paid for in the period. */
  bookingsCount: z.number().int().nonnegative(),
  /** Everything drivers paid (bookings, extensions, overstay, service fee) less refunds. */
  grossBookingKobo: z.number().int(),
  commissionKobo: z.number().int(),
  serviceFeeKobo: z.number().int(),
  /** The operator's share: what Parkly owes them for the period. */
  netOperatorKobo: z.number().int(),
  /** Paid for extensions, before refunds. */
  extensionKobo: z.number().int().nonnegative(),
  /** Paid for overstay, before refunds. */
  overstayKobo: z.number().int().nonnegative(),
  /** Money handed back to drivers (already taken off gross). */
  refundKobo: z.number().int().nonnegative(),
};

export const DailyEarningsItemSchema = z.object({
  date: LagosDateSchema,
  ...EarningsAmountsShape,
  /** Payouts that reached the operator's bank this day (SETTLED only). */
  settlementKobo: z.number().int(),
  settlementStatus: z.enum(['NONE', 'PENDING', 'PROCESSING', 'SETTLED', 'PARTIAL', 'FAILED']),
  settlementReferences: z.array(z.string()),
});

export const SettlementSummarySchema = z.object({
  id: z.uuid(),
  providerSettlementId: z.string(),
  amountKobo: z.number().int(),
  status: z.enum(['PENDING', 'PROCESSING', 'SETTLED', 'FAILED', 'NEEDS_REVIEW']),
  settledAt: z.iso.datetime().nullable(),
});

export const OperatorEarningsTotalsSchema = z.object({
  ...EarningsAmountsShape,
  settlementKobo: z.number().int(),
});

export const OperatorEarningsReportSchema = z.object({
  operatorId: z.uuid(),
  from: LagosDateSchema,
  to: LagosDateSchema,
  lotId: z.uuid().nullable(),
  totals: OperatorEarningsTotalsSchema,
  daily: z.array(DailyEarningsItemSchema),
  settlements: z.array(SettlementSummarySchema),
});

export const MonthlyStatementQuerySchema = z.object({
  format: z.enum(['json', 'pdf']).default('json'),
});

export const MonthlyStatementLotSummarySchema = z.object({
  lotId: z.uuid(),
  lotName: z.string(),
  bookingsCount: z.number().int().nonnegative(),
  grossBookingKobo: z.number().int(),
  commissionKobo: z.number().int(),
  netOperatorKobo: z.number().int(),
});

export const MonthlyStatementTotalsSchema = z.object({
  ...EarningsAmountsShape,
  settlementKobo: z.number().int(),
  closingBalanceKobo: z.number().int(),
});

export const MonthlyStatementSchema = z.object({
  statementNumber: z.string(),
  month: LagosMonthSchema,
  operatorId: z.uuid(),
  operatorName: z.string(),
  payoutAccount: z
    .object({
      bankName: z.string().nullable(),
      accountNumberLast4: z.string().nullable(),
      accountName: z.string().nullable(),
    })
    .nullable(),
  periodStart: LagosDateSchema,
  periodEnd: LagosDateSchema,
  totals: MonthlyStatementTotalsSchema,
  lots: z.array(MonthlyStatementLotSummarySchema),
  settlements: z.array(SettlementSummarySchema),
  generatedAt: z.iso.datetime(),
});

export type OperatorEarningsQuery = z.infer<typeof OperatorEarningsQuerySchema>;
export type DailyEarningsItem = z.infer<typeof DailyEarningsItemSchema>;
export type SettlementSummary = z.infer<typeof SettlementSummarySchema>;
export type OperatorEarningsTotals = z.infer<typeof OperatorEarningsTotalsSchema>;
export type OperatorEarningsReport = z.infer<typeof OperatorEarningsReportSchema>;
export type MonthlyStatementQuery = z.infer<typeof MonthlyStatementQuerySchema>;
export type MonthlyStatementLotSummary = z.infer<typeof MonthlyStatementLotSummarySchema>;
export type MonthlyStatementTotals = z.infer<typeof MonthlyStatementTotalsSchema>;
export type MonthlyStatement = z.infer<typeof MonthlyStatementSchema>;

/** Admin: Parkly's revenue across operators for a window (at most 93 days). */
export const PlatformEarningsQuerySchema = z.object({
  from: LagosDateSchema,
  to: LagosDateSchema,
});

const PlatformAmountsShape = {
  ...EarningsAmountsShape,
  /** Paystack's fees on these payments, which Parkly bears. */
  paymentFeesKobo: z.number().int(),
  /** Commission plus service fees, less Paystack's fees. */
  netRevenueKobo: z.number().int(),
};

export const PlatformEarningsReportSchema = z.object({
  from: LagosDateSchema,
  to: LagosDateSchema,
  totals: z.object(PlatformAmountsShape),
  daily: z.array(z.object({ date: LagosDateSchema, ...PlatformAmountsShape })),
  /** Operators with money in the window, highest net revenue first. */
  operators: z.array(
    z.object({
      operatorId: z.uuid(),
      operatorName: z.string(),
      /** The operator's current rate; past bookings keep the rate they were made at. */
      commissionBps: z.number().int(),
      ...PlatformAmountsShape,
    }),
  ),
});

export type PlatformEarningsQuery = z.infer<typeof PlatformEarningsQuerySchema>;
export type PlatformEarningsReport = z.infer<typeof PlatformEarningsReportSchema>;
