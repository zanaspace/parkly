import { NextResponse, type NextRequest } from 'next/server';
import { proxyDownload, UUID } from '../../../../../../lib/finance/download';

/** Only the filters are passed on. */
const KEYS = ['from', 'to', 'lotId'] as const;

/**
 * FR-OPS-003: the finance page's "Download CSV". The API audits it
 * (`operator.earnings_exported`) and stamps the file with who downloaded it.
 */
export async function GET(req: NextRequest, ctx: { params: Promise<{ operatorId: string }> }) {
  const { operatorId } = await ctx.params;
  if (!UUID.test(operatorId)) return NextResponse.json({ code: 'NOT_FOUND' }, { status: 404 });
  const q = new URLSearchParams();
  for (const k of KEYS) {
    const v = req.nextUrl.searchParams.get(k);
    if (v) q.set(k, v);
  }
  return proxyDownload(req, `/v1/operators/${operatorId}/reports/export`, q, {
    query: new URLSearchParams(q),
    errorKey: 'exportError',
  });
}
