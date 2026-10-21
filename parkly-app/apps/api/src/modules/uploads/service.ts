import { createHash } from 'node:crypto';
import { v7 as uuidv7 } from 'uuid';
import type { MalwareScanner, StorageProvider } from '../../providers/index.js';
import type { FileRow, Store } from '../../store/types.js';
import { reencodeImage } from './image.js';
import {
  checkDeclared,
  checkUploaded,
  UPLOAD_POLICIES,
  type Declared,
  type UploadPurpose,
  type UploadRejection,
} from './policy.js';

/**
 * Doc 05 V12: signed upload URLs are usable for ≤ 10 min. Supabase's own
 * upload URLs last longer, so the window is enforced when the upload is
 * completed; late uploads are rejected and swept.
 */
export const UPLOAD_WINDOW_MS = 10 * 60 * 1000;

export type UploadDeps = {
  store: Store;
  storage: StorageProvider;
  scanner: MalwareScanner;
  now: () => Date;
};

export type Owner = { type: string; id: string };

/** Step 1: validate what the client says it will send, record it, hand back a signed URL. */
export async function presignUpload(
  deps: UploadDeps,
  input: { purpose: UploadPurpose; owner: Owner; uploadedBy: string; declared: Declared },
): Promise<
  | { ok: true; fileId: string; uploadUrl: string; token: string; expiresInSec: number }
  | { ok: false; reason: NonNullable<ReturnType<typeof checkDeclared>> }
> {
  const problem = checkDeclared(input.purpose, input.declared);
  if (problem) return { ok: false, reason: problem };

  const policy = UPLOAD_POLICIES[input.purpose];
  const fileId = uuidv7();
  // Path is fixed by the API, never by the client, and carries no file name.
  const path = `${input.owner.type}/${input.owner.id}/${fileId}`;
  await deps.store.files.create({
    id: fileId,
    bucket: policy.bucket,
    path,
    dataClass: policy.dataClass,
    retentionPolicy: policy.retentionPolicy,
    ownerEntityType: input.owner.type,
    ownerEntityId: input.owner.id,
    uploadedBy: input.uploadedBy,
    mime: input.declared.mime,
    sizeBytes: input.declared.sizeBytes,
    sha256: Buffer.from(input.declared.sha256, 'hex'),
    createdAt: deps.now(),
  });
  const { url, token } = await deps.storage.createSignedUploadUrl({ bucket: policy.bucket, path });
  return { ok: true, fileId, uploadUrl: url, token, expiresInSec: UPLOAD_WINDOW_MS / 1000 };
}

export type CompleteResult =
  { ok: true; file: FileRow } | { ok: false; reason: UploadRejection | 'NOT_FOUND' | 'EXPIRED' };

/**
 * Step 2, after the client uploaded: re-read the object and check it really is
 * what was declared, re-encode images, scan PDFs. Only then is the file usable.
 * Failures delete the object. Safe to call again.
 */
export async function completeUpload(
  deps: UploadDeps,
  input: { fileId: string; purpose: UploadPurpose; owner: Owner },
): Promise<CompleteResult> {
  const file = await deps.store.files.find(input.fileId);
  const policy = UPLOAD_POLICIES[input.purpose];
  if (
    !file ||
    file.ownerEntityType !== input.owner.type ||
    file.ownerEntityId !== input.owner.id ||
    file.bucket !== policy.bucket
  )
    return { ok: false, reason: 'NOT_FOUND' };
  if (file.status === 'VERIFIED') return { ok: true, file };
  if (file.status === 'REJECTED')
    return {
      ok: false,
      reason: (file.rejectionReason as UploadRejection | null) ?? 'TYPE_MISMATCH',
    };

  const reject = async (reason: UploadRejection | 'EXPIRED'): Promise<CompleteResult> => {
    await deps.storage.remove({ bucket: file.bucket, paths: [file.path] });
    await deps.store.files.markRejected(file.id, reason);
    return { ok: false, reason };
  };

  if (deps.now().getTime() - file.createdAt.getTime() > UPLOAD_WINDOW_MS) return reject('EXPIRED');

  const bytes = await deps.storage.download({ bucket: file.bucket, path: file.path });
  if (!bytes) return { ok: false, reason: 'NOT_UPLOADED' };

  const check = checkUploaded(input.purpose, bytes, file);
  if (!check.ok) return reject(check.reason);

  let stored = { mime: check.mime as string, bytes };
  if (check.mime === 'application/pdf') {
    const scan = await deps.scanner.scan({ bytes, filename: file.id });
    if (!scan.clean) return reject('MALWARE');
  } else {
    const webp = await reencodeImage(bytes);
    if (!webp) return reject('IMAGE_UNREADABLE');
    await deps.storage.upload({
      bucket: file.bucket,
      path: file.path,
      body: webp,
      contentType: 'image/webp',
    });
    stored = { mime: 'image/webp', bytes: webp };
  }

  const verified = {
    mime: stored.mime,
    sizeBytes: stored.bytes.length,
    sha256: createHash('sha256').update(stored.bytes).digest(),
  };
  const at = deps.now();
  await deps.store.files.markVerified(file.id, verified, at);
  return {
    ok: true,
    file: { ...file, ...verified, status: 'VERIFIED', verifiedAt: at, rejectionReason: null },
  };
}
