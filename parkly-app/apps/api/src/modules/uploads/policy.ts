import { createHash } from 'node:crypto';
import type { Bucket } from '../../providers/index.js';

export type Mime = 'application/pdf' | 'image/jpeg' | 'image/png' | 'image/webp';
export type UploadPurpose =
  'KYB_DOCUMENT' | 'PERMIT_DOCUMENT' | 'LOT_PHOTO' | 'VERIFICATION_EVIDENCE';

export type UploadPolicy = {
  bucket: Bucket;
  dataClass: 'C3' | 'C4';
  /** Retention rule name from doc 06; the retention job reads it from `files`. */
  retentionPolicy: string;
  mimes: readonly Mime[];
  maxBytes: number;
};

const MB = 1024 * 1024;
const DOCS: readonly Mime[] = ['application/pdf', 'image/jpeg', 'image/png'];
const IMAGES: readonly Mime[] = ['image/jpeg', 'image/png', 'image/webp'];

/** Doc 05 V12 (10 MB, private buckets) and doc 06 §3.5–3.6 (classes, retention). */
export const UPLOAD_POLICIES: Record<UploadPurpose, UploadPolicy> = {
  KYB_DOCUMENT: {
    bucket: 'kyb-docs',
    dataClass: 'C4',
    retentionPolicy: 'operator_relationship_plus_6y',
    mimes: DOCS,
    maxBytes: 10 * MB,
  },
  PERMIT_DOCUMENT: {
    bucket: 'permits',
    dataClass: 'C3',
    retentionPolicy: 'permit_expiry_plus_6y',
    mimes: DOCS,
    maxBytes: 10 * MB,
  },
  LOT_PHOTO: {
    bucket: 'lot-photos',
    dataClass: 'C3',
    retentionPolicy: 'lot_life',
    mimes: IMAGES,
    maxBytes: 10 * MB,
  },
  VERIFICATION_EVIDENCE: {
    bucket: 'verification',
    dataClass: 'C3',
    retentionPolicy: 'lot_life_plus_6y',
    mimes: IMAGES,
    maxBytes: 10 * MB,
  },
};

const startsWith = (b: Uint8Array, sig: number[], at = 0) => sig.every((v, i) => b[at + i] === v);
const ascii = (s: string) => [...s].map((c) => c.charCodeAt(0));

/** The file's real type from its first bytes. SVG/HTML and anything unknown → null. */
export function sniffMime(b: Uint8Array): Mime | null {
  if (startsWith(b, ascii('%PDF-'))) return 'application/pdf';
  if (startsWith(b, [0xff, 0xd8, 0xff])) return 'image/jpeg';
  if (startsWith(b, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'image/png';
  if (startsWith(b, ascii('RIFF')) && startsWith(b, ascii('WEBP'), 8)) return 'image/webp';
  return null;
}

export type Declared = { mime: string; sizeBytes: number; sha256: string };

/** Checks what the client says it will upload, before a signed URL is issued. */
export function checkDeclared(
  purpose: UploadPurpose,
  d: Declared,
): 'TYPE_NOT_ALLOWED' | 'TOO_LARGE' | 'EMPTY' | 'BAD_CHECKSUM' | null {
  const policy = UPLOAD_POLICIES[purpose];
  if (!(policy.mimes as readonly string[]).includes(d.mime)) return 'TYPE_NOT_ALLOWED';
  if (!Number.isSafeInteger(d.sizeBytes) || d.sizeBytes <= 0) return 'EMPTY';
  if (d.sizeBytes > policy.maxBytes) return 'TOO_LARGE';
  if (!/^[0-9a-f]{64}$/i.test(d.sha256)) return 'BAD_CHECKSUM';
  return null;
}

export type UploadRejection =
  | 'NOT_UPLOADED'
  | 'SIZE_MISMATCH'
  | 'CHECKSUM_MISMATCH'
  | 'TYPE_MISMATCH'
  | 'IMAGE_UNREADABLE'
  | 'MALWARE';

/** Re-checks the stored bytes against what was declared (doc 05 V12). */
export function checkUploaded(
  purpose: UploadPurpose,
  bytes: Uint8Array,
  declared: { mime: string; sizeBytes: number; sha256: Buffer },
): { ok: true; mime: Mime } | { ok: false; reason: UploadRejection } {
  if (bytes.length !== declared.sizeBytes) return { ok: false, reason: 'SIZE_MISMATCH' };
  const actual = createHash('sha256').update(bytes).digest();
  if (!actual.equals(declared.sha256)) return { ok: false, reason: 'CHECKSUM_MISMATCH' };
  const mime = sniffMime(bytes);
  if (!mime || mime !== declared.mime || !UPLOAD_POLICIES[purpose].mimes.includes(mime))
    return { ok: false, reason: 'TYPE_MISMATCH' };
  return { ok: true, mime };
}
