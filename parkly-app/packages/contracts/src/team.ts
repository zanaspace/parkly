import { z } from 'zod';

/** Doc 02 §2.3 operator_members. Owners are created with the operator; others are invited. */
export const MemberRoleSchema = z.enum(['OWNER', 'MANAGER', 'ATTENDANT']);

/** O-20 Team: active members and open invites. */
export const TeamMemberSchema = z.object({
  id: z.uuid(),
  role: MemberRoleSchema,
  status: z.enum(['INVITED', 'ACTIVE']),
  /** The member's profile name, or the name typed on the invite. */
  name: z.string().nullable(),
  /** Attendants only; empty = every lot of the operator. */
  lotIds: z.array(z.uuid()),
  invitedAt: z.iso.datetime(),
  inviteExpiresAt: z.iso.datetime().nullable(),
  acceptedAt: z.iso.datetime().nullable(),
});
export const TeamMemberListSchema = z.object({ items: z.array(TeamMemberSchema) });

/**
 * Doc 03 §2.3. Managers sign in to the portal by email; attendants use their
 * phone (attendant app, S5). Owners invite either; managers invite attendants.
 */
export const InviteMemberRequestSchema = z.discriminatedUnion('role', [
  z.object({
    role: z.literal('MANAGER'),
    name: z.string().trim().min(2).max(100),
    email: z.email().max(254),
  }),
  z.object({
    role: z.literal('ATTENDANT'),
    name: z.string().trim().min(2).max(100),
    phone: z.string().trim().min(7).max(20),
    lotIds: z.array(z.uuid()).max(50).default([]),
  }),
]);

/** The token is shown once; only its hash is stored. The link expires in 72 hours. */
export const InviteMemberResponseSchema = z.object({
  member: TeamMemberSchema,
  inviteToken: z.string(),
});

export const AcceptInviteRequestSchema = z.object({
  inviteToken: z.string().regex(/^[A-Za-z0-9_-]{43}$/, 'Invalid invite token'),
});
export const AcceptInviteResponseSchema = z.object({
  operatorId: z.uuid(),
  role: MemberRoleSchema,
});

export type MemberRole = z.infer<typeof MemberRoleSchema>;
export type TeamMember = z.infer<typeof TeamMemberSchema>;
export type InviteMemberRequest = z.infer<typeof InviteMemberRequestSchema>;
export type InviteMemberResponse = z.infer<typeof InviteMemberResponseSchema>;
export type AcceptInviteResponse = z.infer<typeof AcceptInviteResponseSchema>;
