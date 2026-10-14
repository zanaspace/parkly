import { describe, expect, it } from 'vitest';
import { ERROR_CODES, ERROR_STATUS } from './errors.js';
import { ProblemSchema } from './problem.js';

describe('error catalogue', () => {
  it('uses UPPER_SNAKE_CASE codes with HTTP error statuses', () => {
    for (const code of ERROR_CODES) {
      expect(code).toMatch(/^[A-Z][A-Z0-9_]+$/);
      expect(ERROR_STATUS[code]).toBeGreaterThanOrEqual(400);
    }
  });

  it('accepts a known code and rejects an unknown one in problem bodies', () => {
    const base = { type: 'about:blank', title: 'x', status: 400 };
    expect(ProblemSchema.safeParse({ ...base, code: 'VALIDATION_FAILED' }).success).toBe(true);
    expect(ProblemSchema.safeParse({ ...base, code: 'MADE_UP' }).success).toBe(false);
  });
});
