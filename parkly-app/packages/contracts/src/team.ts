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
 * Doc 03 §2.3. Managers sign in to the portal by email. Attendants are invited
 * by email or by phone (one of the two; ADR 0015: email while SMS is not
 * live). Owners invite either role; managers invite attendants.
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
    phone: z.string().trim().min(7).max(20).optional(),
    email: z.email().max(254).optional(),
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

/**
 * What the invite page shows before anyone signs in: who invited them and as
 * what. Unknown, used and cancelled links all read INVALID (no enumeration).
 */
export const InvitePreviewSchema = z.discriminatedUnion('state', [
  z.object({
    state: z.literal('OPEN'),
    role: MemberRoleSchema,
    businessName: z.string(),
    expiresAt: z.iso.datetime(),
  }),
  z.object({ state: z.literal('EXPIRED'), businessName: z.string() }),
  z.object({ state: z.literal('INVALID') }),
]);

export type InvitePreview = z.infer<typeof InvitePreviewSchema>;
export type MemberRole = z.infer<typeof MemberRoleSchema>;
export type TeamMember = z.infer<typeof TeamMemberSchema>;
export type InviteMemberRequest = z.infer<typeof InviteMemberRequestSchema>;
export type InviteMemberResponse = z.infer<typeof InviteMemberResponseSchema>;
export type AcceptInviteResponse = z.infer<typeof AcceptInviteResponseSchema>;
