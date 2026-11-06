import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiProblem } from '../api';
import { resolveReconciliationItemAction } from './actions';

const mockApiFetch = vi.fn();
const mockRequireAccess = vi.fn();
const mockRevalidatePath = vi.fn();

vi.mock('../api', () => ({
  apiFetch: (...args: unknown[]) => mockApiFetch(...args),
  ApiProblem: class ApiProblem extends Error {
    constructor(
      public status: number,
      public code: string,
      public detail?: string,
    ) {
      super(detail ?? code);
    }
  },
}));

vi.mock('../auth/session', () => ({
  requireAccess: () => mockRequireAccess(),
}));

vi.mock('../env', () => ({
  publicEnv: () => ({ apiUrl: 'http://localhost:4000' }),
}));

vi.mock('next/cache', () => ({
  revalidatePath: (path: string) => mockRevalidatePath(path),
}));

describe('resolveReconciliationItemAction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAccess.mockResolvedValue({
      accessToken: 'test-token',
      me: { id: 'user-1', roles: [{ role: 'ADMIN_FINANCE' }] },
    });
  });

  it('rejects empty or short resolution notes', async () => {
    const res = await resolveReconciliationItemAction({
      itemId: 'item-1',
      runId: 'run-1',
      notes: 'abc',
    });
    expect(res).toEqual({
      ok: false,
      error: 'Provide at least 5 characters explaining the resolution.',
    });
    expect(mockApiFetch).not.toHaveBeenCalled();
  });

  it('calls resolve endpoint and revalidates paths on success', async () => {
    mockApiFetch.mockResolvedValue({ id: 'item-1', resolvedAt: '2026-11-06T12:00:00Z' });

    const res = await resolveReconciliationItemAction({
      itemId: 'item-1',
      runId: 'run-1',
      notes: 'Manual bank adjustment verified with Paystack',
    });

    expect(res).toEqual({ ok: true });
    expect(mockApiFetch).toHaveBeenCalledWith(
      'http://localhost:4000',
      '/v1/admin/reconciliation/items/item-1/resolve',
      'test-token',
      {
        method: 'POST',
        body: { notes: 'Manual bank adjustment verified with Paystack' },
      },
    );
    expect(mockRevalidatePath).toHaveBeenCalledWith('/finance/reconciliation/run-1');
    expect(mockRevalidatePath).toHaveBeenCalledWith('/finance');
  });

  it('handles ApiProblem gracefully', async () => {
    mockApiFetch.mockRejectedValue(
      new ApiProblem(404, 'NOT_FOUND', 'Reconciliation item not found'),
    );

    const res = await resolveReconciliationItemAction({
      itemId: 'item-unknown',
      runId: 'run-1',
      notes: 'Valid explanation note',
    });

    expect(res).toEqual({
      ok: false,
      error: 'Reconciliation item not found',
    });
  });
});
