import { describe, expect, it } from 'vitest';
import { AcceptInviteRequestSchema, InviteMemberRequestSchema } from './team.js';

describe('team contracts (FR-OPS-004)', () => {
  it('invites managers by email and attendants by phone, with optional lots', () => {
    expect(
      InviteMemberRequestSchema.safeParse({ role: 'MANAGER', name: 'Bisi', email: 'bisi@eko.ng' })
        .success,
    ).toBe(true);
    const attendant = InviteMemberRequestSchema.parse({
      role: 'ATTENDANT',
      name: 'Musa',
      phone: '0803 123 4567',
    });
    expect(attendant).toMatchObject({ lotIds: [] });
    expect(
      InviteMemberRequestSchema.safeParse({ role: 'MANAGER', name: 'Bisi', phone: '08031234567' })
        .success,
    ).toBe(false);
    expect(
      InviteMemberRequestSchema.safeParse({ role: 'OWNER', name: 'X', email: 'x@eko.ng' }).success,
    ).toBe(false);
  });

  it('accepts only well-formed invite tokens', () => {
    expect(AcceptInviteRequestSchema.safeParse({ inviteToken: 'a'.repeat(43) }).success).toBe(true);
    expect(AcceptInviteRequestSchema.safeParse({ inviteToken: 'a/b' }).success).toBe(false);
  });
});
