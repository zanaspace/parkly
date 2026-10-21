import { describe, expect, it } from 'vitest';
import { checkDeclared, checkUploaded, sniffMime, UPLOAD_POLICIES } from './policy.js';

const bytes = (...b: number[]) => new Uint8Array(b);
const ascii = (s: string) => new Uint8Array(Buffer.from(s, 'latin1'));

describe('sniffMime (magic bytes, never the client’s word)', () => {
  it.each([
    ['PDF', ascii('%PDF-1.7\n...'), 'application/pdf'],
    ['JPEG', bytes(0xff, 0xd8, 0xff, 0xe0, 0, 0x10), 'image/jpeg'],
    ['PNG', bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0), 'image/png'],
    ['WebP', ascii('RIFF\x00\x00\x00\x00WEBPVP8 '), 'image/webp'],
    ['HTML', ascii('<html><script>alert(1)</script>'), null],
    ['SVG', ascii('<svg xmlns="http://www.w3.org/2000/svg"/>'), null],
    ['RIFF but not WebP (WAV)', ascii('RIFF\x00\x00\x00\x00WAVEfmt '), null],
    ['empty', bytes(), null],
  ] as const)('%s → %s', (_n, input, mime) => {
    expect(sniffMime(input)).toBe(mime);
  });
});

describe('upload policies (doc 05 V12, PRD FR-LOT-002/003)', () => {
  it('keeps KYB documents C4 in the private kyb-docs bucket', () => {
    expect(UPLOAD_POLICIES.KYB_DOCUMENT).toMatchObject({ bucket: 'kyb-docs', dataClass: 'C4' });
  });
  it('caps every upload at 10 MB', () => {
    for (const p of Object.values(UPLOAD_POLICIES)) expect(p.maxBytes).toBe(10 * 1024 * 1024);
  });
  it('allows PDF/JPG/PNG for documents and JPG/PNG/WebP for photos', () => {
    expect(UPLOAD_POLICIES.PERMIT_DOCUMENT.mimes).toEqual([
      'application/pdf',
      'image/jpeg',
      'image/png',
    ]);
    expect(UPLOAD_POLICIES.LOT_PHOTO.mimes).toEqual(['image/jpeg', 'image/png', 'image/webp']);
  });
});

describe('checkDeclared (before issuing a signed URL)', () => {
  const ok = { mime: 'application/pdf', sizeBytes: 1000, sha256: 'a'.repeat(64) };
  it('accepts an allowed type and size', () => {
    expect(checkDeclared('PERMIT_DOCUMENT', ok)).toBeNull();
  });
  it.each([
    [{ ...ok, mime: 'image/svg+xml' }, 'TYPE_NOT_ALLOWED'],
    [{ ...ok, mime: 'image/webp' }, 'TYPE_NOT_ALLOWED'],
    [{ ...ok, sizeBytes: 10 * 1024 * 1024 + 1 }, 'TOO_LARGE'],
    [{ ...ok, sizeBytes: 0 }, 'EMPTY'],
    [{ ...ok, sha256: 'xyz' }, 'BAD_CHECKSUM'],
  ] as const)('rejects %o with %s', (declared, reason) => {
    expect(checkDeclared('PERMIT_DOCUMENT', declared)).toBe(reason);
  });
});

describe('checkUploaded (after the client uploaded)', () => {
  const pdf = ascii('%PDF-1.7 hello');
  const wrongSha = Buffer.from(
    // Deliberately not the file's checksum.
    '6b5a8f4e3b7f7d1b0c6f2f0e4c0b1d0a8e9f3c2b1a0d9e8f7a6b5c4d3e2f1a0b',
    'hex',
  );
  const real = async () => (await import('node:crypto')).createHash('sha256').update(pdf).digest();

  it('accepts bytes that match the declared size, checksum and type', async () => {
    const declared = { mime: 'application/pdf', sizeBytes: pdf.length, sha256: await real() };
    expect(checkUploaded('PERMIT_DOCUMENT', pdf, declared)).toEqual({
      ok: true,
      mime: 'application/pdf',
    });
  });
  it('rejects a different size', async () => {
    const declared = { mime: 'application/pdf', sizeBytes: pdf.length + 1, sha256: await real() };
    expect(checkUploaded('PERMIT_DOCUMENT', pdf, declared)).toEqual({
      ok: false,
      reason: 'SIZE_MISMATCH',
    });
  });
  it('rejects a different checksum', () => {
    const declared = { mime: 'application/pdf', sizeBytes: pdf.length, sha256: wrongSha };
    expect(checkUploaded('PERMIT_DOCUMENT', pdf, declared)).toEqual({
      ok: false,
      reason: 'CHECKSUM_MISMATCH',
    });
  });
  it('rejects content that is not what was declared (HTML renamed to .pdf)', async () => {
    const html = ascii('<html>not a pdf</html>');
    const { createHash } = await import('node:crypto');
    const declared = {
      mime: 'application/pdf',
      sizeBytes: html.length,
      sha256: createHash('sha256').update(html).digest(),
    };
    expect(checkUploaded('PERMIT_DOCUMENT', html, declared)).toEqual({
      ok: false,
      reason: 'TYPE_MISMATCH',
    });
  });
});
