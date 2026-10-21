/** Browser-side helpers for API-issued signed upload URLs (doc 05 V12). */

export async function sha256Hex(file: File): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** PUTs the file straight to Supabase Storage; the API re-checks it afterwards. */
export async function putToSignedUrl(uploadUrl: string, file: File): Promise<boolean> {
  const res = await fetch(uploadUrl, {
    method: 'PUT',
    headers: { 'content-type': file.type },
    body: file,
  });
  return res.ok;
}
