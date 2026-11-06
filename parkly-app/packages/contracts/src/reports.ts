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

export const DailyEarningsItemSchema = z.object({
  date: LagosDateSchema,
  bookingsCount: z.number().int().nonnegative(),
  grossBookingKobo: z.number().int(),
  commissionKobo: z.number().int(),
  serviceFeeKobo: z.number().int(),
  netOperatorKobo: z.number().int(),
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
  bookingsCount: z.number().int().nonnegative(),
  grossBookingKobo: z.number().int(),
  commissionKobo: z.number().int(),
  serviceFeeKobo: z.number().int(),
  netOperatorKobo: z.number().int(),
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
  bookingsCount: z.number().int().nonnegative(),
  grossBookingKobo: z.number().int(),
  commissionKobo: z.number().int(),
  serviceFeeKobo: z.number().int(),
  netOperatorKobo: z.number().int(),
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
