import { notFound } from 'next/navigation';
import { apiUrl, ApiProblem } from '../../../../lib/api';
import { requireDriver } from '../../../../lib/session';

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const driver = await requireDriver(`/bookings/${id}/receipt`);
  try {
    const res = await fetch(
      `${apiUrl()}/v1/bookings/${encodeURIComponent(id)}/receipt?format=html`,
      {
        headers: {
          authorization: `Bearer ${driver.accessToken}`,
          accept: 'text/html',
        },
        cache: 'no-store',
      },
    );
    if (res.status === 404) notFound();
    if (!res.ok) {
      return new Response('Unable to generate receipt', { status: res.status });
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
