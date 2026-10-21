import { z } from 'zod';

/** Doc 02 §2.3 `operator_kyb_documents.type`. */
export const KybDocumentTypeSchema = z.enum(['CAC_CERT', 'DIRECTOR_ID', 'UTILITY_BILL', 'OTHER']);

/** Doc 03 O-04: PDF, JPG or PNG, ≤ 10 MB. Images are re-encoded to WebP after upload. */
export const KybUploadMimeSchema = z.enum(['application/pdf', 'image/jpeg', 'image/png']);

const Sha256HexSchema = z.string().regex(/^[0-9a-f]{64}$/i, 'SHA-256 as 64 hex characters');

export const PresignKybDocumentRequestSchema = z.object({
  type: KybDocumentTypeSchema,
  contentType: KybUploadMimeSchema,
  sizeBytes: z
    .number()
    .int()
    .positive()
    .max(10 * 1024 * 1024),
  sha256: Sha256HexSchema,
});

/** The client PUTs the file to `uploadUrl` (Supabase Storage), then calls complete. */
export const PresignUploadResponseSchema = z.object({
  fileId: z.uuid(),
  uploadUrl: z.url(),
  expiresInSec: z.number().int(),
});

export const CompleteKybDocumentRequestSchema = z.object({ type: KybDocumentTypeSchema });

export const KybDocumentSchema = z.object({
  id: z.uuid(),
  type: KybDocumentTypeSchema,
  status: z.enum(['SUBMITTED', 'IN_REVIEW', 'APPROVED', 'REJECTED']),
  /** As stored (images become image/webp). */
  mime: z.string(),
  sizeBytes: z.number().int(),
  uploadedAt: z.iso.datetime(),
  rejectionReason: z.string().nullable(),
});

export const KybDocumentListSchema = z.object({ items: z.array(KybDocumentSchema) });

export const BankSchema = z.object({ code: z.string(), name: z.string() });
export const BankListSchema = z.object({ items: z.array(BankSchema) });

/** NUBAN: 10 digits. */
export const SetPayoutAccountRequestSchema = z.object({
  bankCode: z
    .string()
    .trim()
    .regex(/^[0-9A-Za-z]{3,10}$/, 'Choose your bank'),
  accountNumber: z
    .string()
    .trim()
    .regex(/^\d{10}$/, 'Enter the 10-digit account number'),
});

/** Doc 06 §3.5: only the masked number and resolved name ever leave the API. */
export const PayoutAccountSchema = z.object({
  bankCode: z.string(),
  bankName: z.string(),
  accountNumberLast4: z.string(),
  accountName: z.string(),
  /** False when the bank's account name differs from the legal name: ops checks it. */
  nameMatchesLegalName: z.boolean(),
  status: z.enum(['PENDING', 'VERIFIED', 'ACTIVE', 'DISABLED']),
});

export type KybDocumentType = z.infer<typeof KybDocumentTypeSchema>;
export type KybDocument = z.infer<typeof KybDocumentSchema>;
export type Bank = z.infer<typeof BankSchema>;
export type PayoutAccount = z.infer<typeof PayoutAccountSchema>;
export type PresignUploadResponse = z.infer<typeof PresignUploadResponseSchema>;
