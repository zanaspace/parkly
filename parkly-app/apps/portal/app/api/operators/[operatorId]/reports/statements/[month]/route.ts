import { NextResponse, type NextRequest } from 'next/server';
import { proxyDownload, UUID } from '../../../../../../../lib/finance/download';

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;

/** FR-OPS-006: one month's statement as a PDF. The API audits the download. */
export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ operatorId: string; month: string }> },
) {
  const { operatorId, month } = await ctx.params;
  if (!UUID.test(operatorId) || !MONTH.test(month)) {
    return NextResponse.json({ code: 'NOT_FOUND' }, { status: 404 });
  }
  return proxyDownload(
    req,
    `/v1/operators/${operatorId}/reports/statements/${month}`,
    new URLSearchParams({ format: 'pdf' }),
    { query: new URLSearchParams(), errorKey: 'statementError' },
  );
}
