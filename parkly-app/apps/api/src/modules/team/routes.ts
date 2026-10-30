import { createHash, randomBytes } from 'node:crypto';
import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import {
  AcceptInviteRequestSchema,
  AcceptInviteResponseSchema,
  InviteMemberRequestSchema,
  InviteMemberResponseSchema,
  InvitePreviewSchema,
  TeamMemberListSchema,
  TeamMemberSchema,
  type TeamMember,
} from '@parkly/contracts';
import { normaliseNigerianPhone } from '@parkly/domain/phone';
import type { AppDeps } from '../../app.js';
import { authenticate, authorize, loadActor, type AuthEnv } from '../../auth/context.js';
import { audit } from '../../lib/audit.js';
import { ApiError } from '../../lib/errors.js';
import { clientIp, retryAfterSec, type LimitRule } from '../../middleware/rate-limit.js';
import { MemberExistsError, StaleVersionError, type MemberRow } from '../../store/types.js';

const json = <T>(schema: T) => ({ content: { 'application/json': { schema } } });
const OperatorIdParam = z.object({ operatorId: z.uuid() });
/** Doc 03 §2.3: invite links expire after 72 hours. */
const INVITE_TTL_MS = 72 * 60 * 60 * 1000;

/** Public lookup: tokens are 256-bit, but keep guessing pointless anyway. */
const INVITE_PREVIEW_IP: LimitRule = { name: 'invite-preview-ip', limit: 30, windowSec: 60 };

const tokenHash = (token: string) => createHash('sha256').update(token).digest();

const toMember = (
  m: MemberRow & { firstName?: string | null; lastName?: string | null },
): TeamMember => ({
  id: m.id,
  role: m.role,
  status: m.status === 'ACTIVE' ? 'ACTIVE' : 'INVITED',
  name: [m.firstName, m.lastName].filter(Boolean).join(' ') || m.inviteeName || null,
  lotIds: m.lotIds,
  invitedAt: m.createdAt.toISOString(),
  inviteExpiresAt: m.inviteExpiresAt?.toISOString() ?? null,
  acceptedAt: m.acceptedAt?.toISOString() ?? null,
});

/** O-20 Team and invite acceptance (FR-OPS-004, doc 03 §2.3, doc 02 §6.6). */
export function teamRoutes(deps: AppDeps) {
  const app = new OpenAPIHono<AuthEnv>();
  const secured = {
    security: [{ bearerAuth: [] }],
    middleware: [authenticate(deps.verifyToken), loadActor(deps.store)],
  };

  app.openapi(
    createRoute({
      method: 'get',
      path: '/operators/{operatorId}/members',
      tags: ['operators'],
      ...secured,
      request: { params: OperatorIdParam },
      responses: { 200: { description: 'Team', ...json(TeamMemberListSchema) } },
    }),
    async (c) => {
      const { operatorId } = c.req.valid('param');
      authorize(c, deps.logger, 'operator:members:read', { operatorId }, { denyAs: 'NOT_FOUND' });
      const rows = await deps.store.members.list(operatorId);
      return c.json({ items: rows.map(toMember) }, 200);
    },
  );

  app.openapi(
    createRoute({
      method: 'post',
      path: '/operators/{operatorId}/members',
      tags: ['operators'],
      ...secured,
      request: {
        params: OperatorIdParam,
        body: { ...json(InviteMemberRequestSchema), required: true },
      },
      responses: { 201: { description: 'Invite created', ...json(InviteMemberResponseSchema) } },
    }),
    async (c) => {
      const { operatorId } = c.req.valid('param');
      authorize(c, deps.logger, 'operator:members:read', { operatorId }, { denyAs: 'NOT_FOUND' });
      authorize(c, deps.logger, 'operator:members:invite', { operatorId });
      const body = c.req.valid('json');
      const actor = c.get('actor');
      const isOwner = actor.roles.some(
        (r) => r.role === 'OPERATOR_OWNER' && r.operatorId === operatorId,
      );
      // Managers may add attendants but not other managers.
      if (body.role === 'MANAGER' && !isOwner) throw new ApiError('FORBIDDEN_ROLE_GRANT');

      let phoneHash: Buffer | null = null;
      let emailHash: Buffer | null = null;
      let lotIds: string[] = [];
      if (body.role === 'ATTENDANT') {
        if (body.email) {
          emailHash = deps.crypto.lookupHash(body.email.trim().toLowerCase());
        } else {
          const phone = normaliseNigerianPhone(body.phone ?? '');
          if (!phone)
            throw new ApiError('VALIDATION_FAILED', 'Check the phone number', {
              errors: [{ path: 'phone', message: 'Enter a Nigerian mobile number or an email.' }],
            });
          phoneHash = deps.crypto.lookupHash(phone);
        }
        lotIds = [...new Set(body.lotIds)];
        for (const lotId of lotIds)
          if (!(await deps.store.lots.find(operatorId, lotId)))
            throw new ApiError('VALIDATION_FAILED', 'Unknown lot', {
              errors: [{ path: 'lotIds', message: 'Pick lots of this business.' }],
            });
      } else {
        emailHash = deps.crypto.lookupHash(body.email.trim().toLowerCase());
      }

      const now = deps.now();
      if (await deps.store.members.findByContact(operatorId, { phoneHash, emailHash }, now))
        throw new ApiError('MEMBER_EXISTS', 'This person is already on the team or invited');

      const token = randomBytes(32).toString('base64url');
      const member = await deps.store.members.invite({
        operatorId,
        role: body.role,
        lotIds,
        inviteeName: body.name,
        inviteePhoneHash: phoneHash,
        inviteeEmailHash: emailHash,
        inviteTokenHash: tokenHash(token),
        inviteExpiresAt: new Date(now.getTime() + INVITE_TTL_MS),
        invitedBy: actor.userId,
      });
      // The name, phone and email are personal data: the audit keeps the role and lots only.
      await audit(c, deps, {
        action: 'member.invited',
        entityType: 'operator',
        entityId: operatorId,
        after: { memberId: member.id, role: member.role, lotIds },
      });
      const operator = await deps.store.operators.find(operatorId);
      const emailed =
        body.email && operator
          ? await deps.notifications.sendInvite({
              to: body.email.trim().toLowerCase(),
              businessName: operator.tradingName,
              role: body.role,
              token,
            })
          : false;
      return c.json({ member: toMember(member), inviteToken: token, emailed }, 201);
    },
  );

  app.openapi(
    createRoute({
      method: 'delete',
      path: '/operators/{operatorId}/members/{memberId}',
      tags: ['operators'],
      ...secured,
      request: { params: OperatorIdParam.extend({ memberId: z.uuid() }) },
      responses: { 200: { description: 'Removed', ...json(TeamMemberSchema) } },
    }),
    async (c) => {
      const { operatorId, memberId } = c.req.valid('param');
      authorize(c, deps.logger, 'operator:members:read', { operatorId }, { denyAs: 'NOT_FOUND' });
      authorize(c, deps.logger, 'operator:members:remove', { operatorId });
      const member = await deps.store.members.find(operatorId, memberId);
      if (!member || member.status === 'REMOVED') throw new ApiError('NOT_FOUND');
      if (member.role === 'OWNER')
        throw new ApiError('INVALID_STATE_TRANSITION', 'The owner can’t be removed');

      let row: MemberRow;
      try {
        row = await deps.store.members.remove(operatorId, memberId, deps.now());
      } catch (err) {
        if (err instanceof StaleVersionError) throw new ApiError('NOT_FOUND');
        throw err;
      }
      // Doc 03 §2.3: a removed member is signed out everywhere at once.
      if (member.status === 'ACTIVE' && member.userId) {
        await deps.store.sessions.revokeAll(member.userId);
        await deps.store.devices.revokeAll(member.userId);
      }
      await audit(c, deps, {
        action: member.status === 'ACTIVE' ? 'member.removed' : 'member.invite_cancelled',
        entityType: 'operator',
        entityId: operatorId,
        after: { memberId, role: member.role },
      });
      return c.json(toMember(row), 200);
    },
  );

  // Doc 03 §2.3 step 2: the invite page shows who invited them and as what, before sign-in.
  // POST so the token never appears in URLs or access logs.
  app.openapi(
    createRoute({
      method: 'post',
      path: '/invites/preview',
      tags: ['auth'],
      request: { body: { ...json(AcceptInviteRequestSchema), required: true } },
      responses: { 200: { description: 'Invite summary', ...json(InvitePreviewSchema) } },
    }),
    async (c) => {
      const limited = await deps.rateLimiter.limit(
        `ip:${clientIp(c.req.header('x-forwarded-for'))}`,
        INVITE_PREVIEW_IP,
      );
      if (!limited.success)
        throw new ApiError('RATE_LIMITED', undefined, {
          headers: { 'retry-after': retryAfterSec(limited.reset, deps.now()) },
        });
      const invite = await deps.store.members.findByToken(
        tokenHash(c.req.valid('json').inviteToken),
      );
      if (!invite || invite.status !== 'INVITED') return c.json({ state: 'INVALID' as const }, 200);
      const operator = await deps.store.operators.find(invite.operatorId);
      if (!operator) return c.json({ state: 'INVALID' as const }, 200);
      const businessName = operator.tradingName;
      if (!invite.inviteExpiresAt || invite.inviteExpiresAt.getTime() <= deps.now().getTime())
        return c.json({ state: 'EXPIRED' as const, businessName }, 200);
      return c.json(
        {
          state: 'OPEN' as const,
          role: invite.role,
          businessName,
          expiresAt: invite.inviteExpiresAt.toISOString(),
        },
        200,
      );
    },
  );

  app.openapi(
    createRoute({
      method: 'post',
      path: '/auth/invites/accept',
      tags: ['auth'],
      security: [{ bearerAuth: [] }],
      middleware: [authenticate(deps.verifyToken), loadActor(deps.store)],
      request: { body: { ...json(AcceptInviteRequestSchema), required: true } },
      responses: { 200: { description: 'Joined the team', ...json(AcceptInviteResponseSchema) } },
    }),
    async (c) => {
      authorize(c, deps.logger, 'profile:read:own', { ownerUserId: c.get('actor').userId });
      const { inviteToken } = c.req.valid('json');
      const invite = await deps.store.members.findByToken(tokenHash(inviteToken));
      // Same answer for unknown, used and someone else's invite: no enumeration.
      if (!invite || invite.status !== 'INVITED') throw new ApiError('INVITE_INVALID');
      const identity = c.get('identity');
      const matches =
        (invite.inviteePhoneHash &&
          identity.phone &&
          invite.inviteePhoneHash.equals(deps.crypto.lookupHash(identity.phone))) ||
        (invite.inviteeEmailHash &&
          identity.email &&
          invite.inviteeEmailHash.equals(deps.crypto.lookupHash(identity.email)));
      if (!matches) throw new ApiError('INVITE_INVALID');
      const now = deps.now();
      if (!invite.inviteExpiresAt || invite.inviteExpiresAt.getTime() <= now.getTime())
        throw new ApiError('INVITE_EXPIRED');

      try {
        await deps.store.members.accept(invite.id, c.get('actor').userId, now);
      } catch (err) {
        if (err instanceof MemberExistsError) throw new ApiError('MEMBER_EXISTS');
        if (err instanceof StaleVersionError) throw new ApiError('INVITE_INVALID');
        throw err;
      }
      await audit(c, deps, {
        action: 'member.invite_accepted',
        entityType: 'operator',
        entityId: invite.operatorId,
        after: { memberId: invite.id, role: invite.role },
      });
      return c.json({ operatorId: invite.operatorId, role: invite.role }, 200);
    },
  );

  return app;
}
