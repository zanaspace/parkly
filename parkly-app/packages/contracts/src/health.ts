import { z } from 'zod';

export const LiveSchema = z.object({ status: z.literal('ok') });

export const ReadySchema = z.object({
  status: z.enum(['ok', 'degraded']),
  checks: z.record(z.string(), z.enum(['ok', 'fail', 'skipped'])),
});

export type Ready = z.infer<typeof ReadySchema>;
