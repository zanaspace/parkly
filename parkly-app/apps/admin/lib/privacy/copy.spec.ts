import { describe, expect, it } from 'vitest';
import { accountNote, canReadDataRequests } from './copy';

describe('privacy copy', () => {
  it('shows data requests to compliance and super admin only', () => {
    for (const role of ['ADMIN_COMPLIANCE', 'SUPER_ADMIN'])
      expect(canReadDataRequests([{ role }])).toBe(true);
    for (const role of ['ADMIN_OPS', 'ADMIN_SUPPORT', 'ADMIN_FINANCE'])
      expect(canReadDataRequests([{ role }])).toBe(false);
  });

  it('says where an account closure stands', () => {
    expect(accountNote({ type: 'DELETION', status: 'COMPLETED', userStatus: 'DELETED' })).toBe(
      'Erased',
    );
    expect(accountNote({ type: 'DELETION', status: 'OPEN', userStatus: 'PENDING_DELETION' })).toBe(
      'Waiting out the 30 days; erased after',
    );
    expect(accountNote({ type: 'DELETION', status: 'CANCELLED', userStatus: 'ACTIVE' })).toBe('');
    expect(accountNote({ type: 'ACCESS', status: 'OPEN', userStatus: 'ACTIVE' })).toBe('');
  });
});
