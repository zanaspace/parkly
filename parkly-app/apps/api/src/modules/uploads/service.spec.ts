import { createHash, randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { beforeEach, describe, expect, it } from 'vitest';
import { FakeMalwareScanner, FakeStorageProvider } from '../../providers/fakes.js';
import { MemoryStore } from '../../store/memory.js';
import { completeUpload, presignUpload, UPLOAD_WINDOW_MS } from './service.js';

const must = <T>(v: T | null | undefined): T => {
  if (v === null || v === undefined) throw new Error('expected a value');
  return v;
};

const T0 = new Date('2026-10-21T10:00:00Z');
const sha = (b: Uint8Array) => createHash('sha256').update(b).digest('hex');
const pdf = new Uint8Array(Buffer.from('%PDF-1.7\n1 0 obj << >> endobj\n%%EOF'));
const eicar = new Uint8Array(
  Buffer.from('%PDF-1.7\nX5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*'),
);

describe('upload service (doc 05 V12)', () => {
  let store: MemoryStore;
  let storage: FakeStorageProvider;
  let scanner: FakeMalwareScanner;
  let now: Date;
  let deps: Parameters<typeof presignUpload>[0];
  const owner = { type: 'permit', id: randomUUID() };
  const uploader = randomUUID();

  beforeEach(() => {
    store = new MemoryStore();
    storage = new FakeStorageProvider();
    scanner = new FakeMalwareScanner();
    now = T0;
    deps = { store, storage, scanner, now: () => now };
  });

  async function presign(
    bytes: Uint8Array,
    mime: string,
    purpose: 'PERMIT_DOCUMENT' | 'LOT_PHOTO' = 'PERMIT_DOCUMENT',
  ) {
    const res = await presignUpload(deps, {
      purpose,
      owner,
      uploadedBy: uploader,
      declared: { mime, sizeBytes: bytes.length, sha256: sha(bytes) },
    });
    if (!res.ok) throw new Error(`presign failed: ${res.reason}`);
    return res;
  }
  const clientUploads = async (fileId: string, bytes: Uint8Array) => {
    const f = must(await store.files.find(fileId));
    storage.put(f.bucket, f.path, bytes);
  };
  const complete = (fileId: string, purpose: 'PERMIT_DOCUMENT' | 'LOT_PHOTO' = 'PERMIT_DOCUMENT') =>
    completeUpload(deps, { fileId, purpose, owner });

  it('issues a signed URL for an API-chosen path and records a PENDING file', async () => {
    const res = await presign(pdf, 'application/pdf');
    const file = await store.files.find(res.fileId);
    expect(file).toMatchObject({
      bucket: 'permits',
      path: `permit/${owner.id}/${res.fileId}`,
      dataClass: 'C3',
      status: 'PENDING',
      uploadedBy: uploader,
      createdAt: T0,
    });
    expect(res.uploadUrl).toContain(`permits/permit/${owner.id}/${res.fileId}`);
    expect(res.expiresInSec).toBe(UPLOAD_WINDOW_MS / 1000);
  });

  it('refuses a type the purpose does not allow, before issuing a URL', async () => {
    const res = await presignUpload(deps, {
      purpose: 'LOT_PHOTO',
      owner,
      uploadedBy: uploader,
      declared: { mime: 'application/pdf', sizeBytes: pdf.length, sha256: sha(pdf) },
    });
    expect(res).toEqual({ ok: false, reason: 'TYPE_NOT_ALLOWED' });
    expect(storage.signedUploads).toEqual([]);
  });

  it('verifies a clean PDF: checks bytes, scans it, marks VERIFIED', async () => {
    const { fileId } = await presign(pdf, 'application/pdf');
    await clientUploads(fileId, pdf);
    expect(await complete(fileId)).toMatchObject({ ok: true, file: { status: 'VERIFIED' } });
    expect(scanner.scanned).toEqual([fileId]);
  });

  it('re-encodes photos to WebP and records the stored bytes, not the uploaded ones', async () => {
    const jpeg = new Uint8Array(
      await sharp({ create: { width: 30, height: 20, channels: 3, background: '#888' } })
        .jpeg()
        .withMetadata({ exif: { IFD3: { GPSLatitudeRef: 'N' } } })
        .toBuffer(),
    );
    const { fileId } = await presign(jpeg, 'image/jpeg', 'LOT_PHOTO');
    await clientUploads(fileId, jpeg);
    const res = await complete(fileId, 'LOT_PHOTO');
    expect(res.ok).toBe(true);

    const file = must(await store.files.find(fileId));
    const stored = must(await storage.download({ bucket: file.bucket, path: file.path }));
    expect(file.mime).toBe('image/webp');
    expect(file.sizeBytes).toBe(stored.length);
    expect(file.sha256.toString('hex')).toBe(sha(stored));
    expect((await sharp(stored).metadata()).exif).toBeUndefined();
    expect(scanner.scanned).toEqual([]);
  });

  it('leaves the file PENDING when nothing has been uploaded yet', async () => {
    const { fileId } = await presign(pdf, 'application/pdf');
    expect(await complete(fileId)).toEqual({ ok: false, reason: 'NOT_UPLOADED' });
    expect((await store.files.find(fileId))?.status).toBe('PENDING');
  });

  it('rejects and deletes content that does not match what was declared', async () => {
    const { fileId } = await presign(pdf, 'application/pdf');
    const swapped = new Uint8Array(Buffer.from('<html><script>steal()</script>xxxxxxxx'));
    await clientUploads(fileId, swapped);
    expect(await complete(fileId)).toEqual({ ok: false, reason: 'SIZE_MISMATCH' });
    const file = must(await store.files.find(fileId));
    expect(file).toMatchObject({ status: 'REJECTED', rejectionReason: 'SIZE_MISMATCH' });
    expect(await storage.download({ bucket: file.bucket, path: file.path })).toBeNull();
  });

  it('rejects malware', async () => {
    const { fileId } = await presign(eicar, 'application/pdf');
    await clientUploads(fileId, eicar);
    expect(await complete(fileId)).toEqual({ ok: false, reason: 'MALWARE' });
    expect((await store.files.find(fileId))?.status).toBe('REJECTED');
  });

  it('rejects uploads completed after the 10-minute window', async () => {
    const { fileId } = await presign(pdf, 'application/pdf');
    await clientUploads(fileId, pdf);
    now = new Date(T0.getTime() + UPLOAD_WINDOW_MS + 1);
    expect(await complete(fileId)).toEqual({ ok: false, reason: 'EXPIRED' });
  });

  it('treats another owner’s file as not found (no cross-tenant completion)', async () => {
    const { fileId } = await presign(pdf, 'application/pdf');
    await clientUploads(fileId, pdf);
    const res = await completeUpload(deps, {
      fileId,
      purpose: 'PERMIT_DOCUMENT',
      owner: { type: 'permit', id: randomUUID() },
    });
    expect(res).toEqual({ ok: false, reason: 'NOT_FOUND' });
    expect((await store.files.find(fileId))?.status).toBe('PENDING');
  });

  it('is idempotent: completing twice returns the same verified file without rescanning', async () => {
    const { fileId } = await presign(pdf, 'application/pdf');
    await clientUploads(fileId, pdf);
    await complete(fileId);
    expect(await complete(fileId)).toMatchObject({ ok: true, file: { status: 'VERIFIED' } });
    expect(scanner.scanned).toHaveLength(1);
  });
});
