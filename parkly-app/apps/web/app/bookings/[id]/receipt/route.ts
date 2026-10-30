import { notFound } from 'next/navigation';
import { apiUrl, ApiProblem } from '../../../../lib/api';
import { requireDriver } from '../../../../lib/session';

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const driver = await requireDriver(`/bookings/${id}/receipt`);
  const pdf = new URL(request.url).searchParams.get('format') === 'pdf';
  try {
    const res = await fetch(
      `${apiUrl()}/v1/bookings/${encodeURIComponent(id)}/receipt?format=${pdf ? 'pdf' : 'html'}`,
      {
        headers: {
          authorization: `Bearer ${driver.accessToken}`,
          accept: pdf ? 'application/pdf' : 'text/html',
        },
        cache: 'no-store',
      },
    );
    if (res.status === 404) notFound();
    if (!res.ok) {
      return new Response('Unable to generate receipt', { status: res.status });
    }
    if (pdf) {
      return new Response(await res.arrayBuffer(), {
        headers: {
          'content-type': 'application/pdf',
          'content-disposition':
            res.headers.get('content-disposition') ?? 'attachment; filename="parkly-receipt.pdf"',
          'cache-control': 'private, no-store',
        },
      });
    }
    const html = await res.text();
    return new Response(html, {
      headers: {
        'content-type': 'text/html; charset=utf-8',
        // The receipt's own inline styles only; no scripts on the site origin (gap review S-3).
        'content-security-policy':
          "default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'",
        'cache-control': 'private, no-store',
      },
    });
  } catch (err) {
    if (err instanceof ApiProblem && (err.status === 404 || err.status === 400)) {
      notFound();
    }
    throw err;
  }
}
