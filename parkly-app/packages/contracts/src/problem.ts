import { z } from 'zod';
import { ERROR_CODES } from './errors.js';

/** RFC 9457 problem details with our stable `code` (doc 00 §3.8). */
export const ProblemSchema = z.object({
  type: z.string(),
  title: z.string(),
  status: z.number().int(),
  code: z.enum(ERROR_CODES as [string, ...string[]]),
  detail: z.string().optional(),
  instance: z.string().optional(),
  requestId: z.string().optional(),
  errors: z
    .array(z.object({ path: z.string(), message: z.string() }))
    .optional()
    .describe('Field-level validation errors (VALIDATION_FAILED only)'),
});

export type Problem = z.infer<typeof ProblemSchema>;
