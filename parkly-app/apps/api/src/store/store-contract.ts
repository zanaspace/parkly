import { randomUUID } from 'node:crypto';
import type { RoleGrant } from '@parkly/domain/authz';
import { describe, expect, it } from 'vitest';
import { DsrAlreadyOpenError, DuplicatePlateError, type Store } from './types.js';

/**
 * Behaviour every Store must have. Runs against MemoryStore in unit tests and
 * against DrizzleStore + real Postgres in integration tests, so the in-memory
 * double used by route tests cannot drift from the database.
 */
export function storeContract(
  name: string,
  setup: () => {
    store: Store;
    /** Creates a user the way sign-up does (auth trigger), returns its id. */
    newUser: (roles?: RoleGrant[]) => Promise<string>;
  },
) {
  describe(`Store contract: ${name}`, () => {
    const { store, newUser } = setup();

    it('ensure() is idempotent and keeps the existing profile', async () => {
      const id = await newUser();
      const first = await store.users.ensure(id, { phoneLast4: '1111' });
      expect(first.created).toBe(false);
      await store.users.updateProfile(id, { firstName: 'Ada' });
      const again = await store.users.ensure(id, { phoneLast4: '2222' });
      expect(again.user.firstName).toBe('Ada');
    });

    it('stores roles and returns them', async () => {
      const op = randomUUID();
      const id = await newUser([{ role: 'OPERATOR_MANAGER', operatorId: op }]);
      expect(await store.users.roles(id)).toEqual(
        expect.arrayContaining([{ role: 'OPERATOR_MANAGER', operatorId: op }]),
      );
      expect(await store.operators.members(op)).toEqual([
        expect.objectContaining({ userId: id, role: 'OPERATOR_MANAGER' }),
      ]);
    });

    it('returns the latest consent per type', async () => {
      const id = await newUser();
      await store.consents.add({
        userId: id,
        type: 'TERMS',
        version: 'v1',
        granted: true,
        ipHash: null,
      });
      await store.consents.add({
        userId: id,
        type: 'TERMS',
        version: 'v2',
        granted: true,
        ipHash: null,
      });
      await store.consents.add({
        userId: id,
        type: 'MARKETING',
        version: 'v2',
        granted: false,
        ipHash: null,
      });
      expect(await store.consents.latest(id)).toEqual({
        TERMS: { version: 'v2', granted: true },
        MARKETING: { version: 'v2', granted: false },
      });
    });

    it('enforces unique active plates per user, one default, and default promotion', async () => {
      const id = await newUser();
      const base = { userId: id, make: null, model: null, colour: null };
      const a = await store.vehicles.create({
        ...base,
        plateRaw: 'AAA111AA',
        plateNorm: 'AAA111AA',
        isDefault: true,
      });
      const b = await store.vehicles.create({
        ...base,
        plateRaw: 'BBB222BB',
        plateNorm: 'BBB222BB',
        isDefault: true,
      });
      await expect(
        store.vehicles.create({
          ...base,
          plateRaw: 'aaa 111-aa',
          plateNorm: 'AAA111AA',
          isDefault: false,
        }),
      ).rejects.toBeInstanceOf(DuplicatePlateError);

      let list = await store.vehicles.list(id);
      expect(list.filter((v) => v.isDefault).map((v) => v.id)).toEqual([b.id]);

      await store.vehicles.setDefault(id, a.id);
      await store.vehicles.update(id, a.id, { colour: 'Blue' });
      list = await store.vehicles.list(id);
      expect(list.map((v) => [v.id, v.isDefault, v.colour])).toEqual([
        [a.id, true, 'Blue'],
        [b.id, false, null],
      ]);

      await store.vehicles.remove(id, a.id);
      expect(await store.vehicles.find(id, a.id)).toBeNull();
      expect((await store.vehicles.list(id)).map((v) => [v.id, v.isDefault])).toEqual([
        [b.id, true],
      ]);

      // A removed plate can be added again.
      await store.vehicles.create({
        ...base,
        plateRaw: 'AAA111AA',
        plateNorm: 'AAA111AA',
        isDefault: false,
      });
      expect(await store.vehicles.find(randomUUID(), b.id)).toBeNull();
    });

    it('upserts devices and revokes by session or all', async () => {
      const id = await newUser();
      const d1 = randomUUID();
      const s1 = randomUUID();
      await store.devices.upsert({
        userId: id,
        clientDeviceId: d1,
        platform: 'ANDROID',
        appVersion: '1',
        authSessionId: s1,
      });
      await store.devices.upsert({
        userId: id,
        clientDeviceId: d1,
        platform: 'ANDROID',
        appVersion: '2',
        authSessionId: s1,
      });
      await store.devices.revokeBySession(id, s1);
      await store.devices.revokeAll(id);
    });

    it('allows only one open deletion request', async () => {
      const id = await newUser();
      await store.dataRequests.createDeletion(id, new Date(Date.now() + 86_400_000));
      await expect(store.dataRequests.createDeletion(id, new Date())).rejects.toBeInstanceOf(
        DsrAlreadyOpenError,
      );
    });

    it('writes audit rows and lists them newest first with filters', async () => {
      const entity = randomUUID();
      for (const action of ['a.one', 'a.two']) {
        await store.audit.write({
          actorUserId: null,
          actorRole: null,
          action,
          entityType: 'contract-test',
          entityId: entity,
          ipHash: null,
          userAgent: null,
          requestId: null,
        });
      }
      const rows = await store.audit.list({
        entityType: 'contract-test',
        entityId: entity,
        limit: 10,
      });
      expect(rows.map((r) => r.action)).toEqual(['a.two', 'a.one']);
      const older = await store.audit.list({ entityId: entity, before: rows[0], limit: 10 });
      expect(older.map((r) => r.action)).toEqual(['a.one']);
    });

    it('reads platform settings', async () => {
      expect(await store.settings.get<string>('legal.terms_version')).toBe('2026-10-01');
      expect(await store.settings.get('does.not.exist')).toBeUndefined();
    });

    it('updates status and marketing preference', async () => {
      const id = await newUser();
      await store.users.setMarketingOptIn(id, true);
      await store.users.setStatus(id, 'PENDING_DELETION');
      expect(await store.users.find(id)).toMatchObject({
        marketingOptIn: true,
        status: 'PENDING_DELETION',
      });
      expect(await store.users.find(randomUUID())).toBeNull();
    });
  });
}
