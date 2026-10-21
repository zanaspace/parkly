import type { Me } from '@parkly/contracts';

/** Lots are managed by the operator's owner or a manager. */
export function lotOperatorId(me: Me): string | null {
  const grant = me.roles.find((r) => r.role === 'OPERATOR_OWNER' || r.role === 'OPERATOR_MANAGER');
  return grant?.operatorId ?? null;
}
