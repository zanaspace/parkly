import { brandedEmail, button, detailsCard, esc, note, paragraph } from '../emails/layout.js';
import type { Logger } from '../lib/logger.js';
import { renderStatementPdf } from '../modules/reports/statement-pdf.js';
import type { EmailProvider } from '../providers/index.js';
import type { Store } from '../store/types.js';
import type { JobHandler } from './routes.js';

function formatNaira(kobo: number): string {
  const isNegative = kobo < 0;
  const abs = Math.abs(kobo);
  const whole = Math.trunc(abs / 100).toLocaleString('en-NG');
  const frac = String(abs % 100).padStart(2, '0');
  return `${isNegative ? '-' : ''}₦${whole}.${frac}`;
}

export function previousLagosMonth(now: Date): string {
  const lagosNow = new Date(now.getTime() + 60 * 60_000);
  const year = lagosNow.getUTCFullYear();
  const month = lagosNow.getUTCMonth(); // 0-based
  const prev = new Date(Date.UTC(year, month - 1, 1));
  const prevYear = prev.getUTCFullYear();
  const prevMonth = String(prev.getUTCMonth() + 1).padStart(2, '0');
  return `${prevYear}-${prevMonth}`;
}

/**
 * FR-OPS-006: Monthly statement runner.
 * Runs on the 1st of each month (07:00 WAT). Generates statement PDF and emails it to operator owner.
 */
export function monthlyStatementsJob(deps: {
  store: Store;
  email: EmailProvider;
  logger: Logger;
  now: () => Date;
}): JobHandler {
  return async ({ deadline }) => {
    const now = deps.now();
    const month = previousLagosMonth(now);

    const candidates = await deps.store.reports.operatorsForMonthlyStatement(month);
    let processed = 0;

    for (let i = 0; i < candidates.length; i++) {
      if (deadline && deps.now().getTime() >= deadline.getTime()) {
        deps.logger.info(
          { event: 'monthly_statements.deadline', processed, remaining: candidates.length - i },
          'monthly statement job paused at deadline',
        );
        return { processed, remaining: candidates.length - i };
      }

      const op = candidates[i]!;
      try {
        const statement = await deps.store.reports.monthlyStatement({
          operatorId: op.id,
          month,
        });

        if (statement && op.contactEmail) {
          const pdfBytes = await renderStatementPdf(statement);

          const summaryCard = detailsCard([
            ['Statement Period', `${esc(statement.periodStart)} to ${esc(statement.periodEnd)}`],
            ['Total Bookings', String(statement.totals.bookingsCount)],
            ['Gross Booking Value', esc(formatNaira(statement.totals.grossBookingKobo))],
            ['Parkly Commission', esc(formatNaira(statement.totals.commissionKobo))],
            ['Net Earnings', esc(formatNaira(statement.totals.netOperatorKobo))],
            ['Settled to Bank', esc(formatNaira(statement.totals.settlementKobo))],
            ['Closing Balance', esc(formatNaira(statement.totals.closingBalanceKobo))],
          ]);

          const html = brandedEmail({
            title: `Monthly Statement · ${month}`,
            heading: `Monthly Statement · ${month}`,
            body: [
              paragraph(`Hello ${esc(op.name)},`),
              paragraph(
                `Your monthly statement of account for <strong>${esc(month)}</strong> is attached as a PDF to this email. Here is a summary of your parking earnings and provider settlements:`,
              ),
              summaryCard,
              note(
                'Settlements are deposited directly into your verified bank account via Paystack. You can also view daily details in the Parkly Operator Portal.',
              ),
            ].join(''),
          });

          const text = [
            `Parkly Monthly Statement · ${month}`,
            `Operator: ${op.name}`,
            `Period: ${statement.periodStart} to ${statement.periodEnd}`,
            `Total Bookings: ${statement.totals.bookingsCount}`,
            `Gross Booking Value: ${formatNaira(statement.totals.grossBookingKobo)}`,
            `Net Earnings: ${formatNaira(statement.totals.netOperatorKobo)}`,
            `Settled to Bank: ${formatNaira(statement.totals.settlementKobo)}`,
            `Closing Balance: ${formatNaira(statement.totals.closingBalanceKobo)}`,
            `Your complete statement PDF is attached.`,
          ].join('\n');

          await deps.email.send({
            to: op.contactEmail,
            subject: `Parkly: Monthly Statement - ${month} (${op.name})`,
            html,
            text,
            attachments: [
              {
                filename: `parkly-statement-${statement.statementNumber}.pdf`,
                contentType: 'application/pdf',
                content: pdfBytes,
              },
            ],
          });

          deps.logger.info(
            {
              event: 'monthly_statement.sent',
              operatorId: op.id,
              statementNumber: statement.statementNumber,
              month,
              to: op.contactEmail,
            },
            'monthly statement sent',
          );
        }

        processed++;
      } catch (err) {
        deps.logger.error(
          { event: 'monthly_statement.failed', operatorId: op.id, err },
          'failed to generate or send monthly statement',
        );
      }
    }

    return { processed, remaining: 0 };
  };
}
