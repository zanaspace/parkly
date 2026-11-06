'use server';

import { revalidatePath } from 'next/cache';
import { apiFetch, ApiProblem } from '../api';
import { requireAccess } from '../auth/session';
import { publicEnv } from '../env';

export async function resolveReconciliationItemAction(params: {
  itemId: string;
  runId: string;
  notes: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const { accessToken } = await requireAccess();
    const trimmedNotes = params.notes?.trim();
    if (!trimmedNotes || trimmedNotes.length < 5) {
      return { ok: false, error: 'Provide at least 5 characters explaining the resolution.' };
    }

    await apiFetch(
      publicEnv().apiUrl,
      `/v1/admin/reconciliation/items/${encodeURIComponent(params.itemId)}/resolve`,
      accessToken,
      {
        method: 'POST',
        body: { notes: trimmedNotes },
      },
    );

    revalidatePath(`/finance/reconciliation/${params.runId}`);
    revalidatePath('/finance');
    return { ok: true };
  } catch (err) {
    if (err instanceof ApiProblem) {
      return { ok: false, error: err.detail ?? err.message };
    }
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Failed to resolve reconciliation item',
    };
  }
}
