import { randomUUID } from 'node:crypto';
import type { RoleGrant } from '@parkly/domain/authz';
import { describe, expect, it } from 'vitest';
import {
  DsrAlreadyOpenError,
  DuplicatePlateError,
  OperatorExistsError,
  SlugTakenError,
  StaleVersionError,
  type Store,
} from './types.js';

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

    it('records uploaded files and their verification outcome', async () => {
      const uploader = await newUser();
      const owner = randomUUID();
      const sha = Buffer.alloc(32, 1);
      const base = {
        bucket: 'permits' as const,
        dataClass: 'C3' as const,
        retentionPolicy: 'permit_expiry_plus_6y',
        ownerEntityType: 'permit',
        ownerEntityId: owner,
        uploadedBy: uploader,
        mime: 'application/pdf',
        sizeBytes: 1234,
        sha256: sha,
        createdAt: new Date('2026-10-21T09:55:00Z'),
      };
      const a = await store.files.create({ ...base, id: randomUUID(), path: `permit/${owner}/a` });
      expect(a).toMatchObject({
        status: 'PENDING',
        sizeBytes: 1234,
        verifiedAt: null,
        createdAt: new Date('2026-10-21T09:55:00Z'),
      });
      expect((await store.files.find(a.id))?.sha256.equals(sha)).toBe(true);

      const at = new Date('2026-10-21T10:00:00Z');
      await store.files.markVerified(
        a.id,
        { mime: 'image/webp', sizeBytes: 99, sha256: Buffer.alloc(32, 2) },
        at,
      );
      expect(await store.files.find(a.id)).toMatchObject({
        status: 'VERIFIED',
        mime: 'image/webp',
        sizeBytes: 99,
        verifiedAt: at,
      });

      const b = await store.files.create({ ...base, id: randomUUID(), path: `permit/${owner}/b` });
      await store.files.markRejected(b.id, 'TYPE_MISMATCH');
      expect(await store.files.find(b.id)).toMatchObject({
        status: 'REJECTED',
        rejectionReason: 'TYPE_MISMATCH',
      });
      expect(await store.files.find(randomUUID())).toBeNull();
    });

    it('creates an operator with its owner atomically, once per user', async () => {
      const owner = await newUser();
      const details = {
        legalName: 'Eko Parking Services Ltd',
        tradingName: 'Eko Parking',
        type: 'COMMERCIAL_LOT' as const,
        cacNumberEnc: 'enc:cac',
        tinEnc: null,
        addressLine: '12 Adetokunbo Ademola St',
        contactEmail: 'ops@eko.example',
        contactPhoneEnc: 'enc:phone',
        commissionBps: 1200,
      };
      const op = await store.operators.create({ ...details, ownerUserId: owner });
      expect(op).toMatchObject({ ...details, status: 'ONBOARDING', kybStatus: 'NOT_STARTED' });
      expect(await store.users.roles(owner)).toEqual(
        expect.arrayContaining([{ role: 'OPERATOR_OWNER', operatorId: op.id }]),
      );
      expect(await store.operators.members(op.id)).toEqual([
        expect.objectContaining({ userId: owner, role: 'OPERATOR_OWNER' }),
      ]);
      expect(await store.operators.ownedBy(owner)).toBe(op.id);
      await expect(
        store.operators.create({ ...details, ownerUserId: owner }),
      ).rejects.toBeInstanceOf(OperatorExistsError);

      const updated = await store.operators.update(op.id, { tradingName: 'Eko Park VI' });
      expect(updated.tradingName).toBe('Eko Park VI');
      expect((await store.operators.find(op.id))?.tradingName).toBe('Eko Park VI');
      expect(await store.operators.find(randomUUID())).toBeNull();
      expect(await store.operators.ownedBy(await newUser())).toBeNull();
    });

    it('keeps KYB documents and one payout account per operator, and marks KYB submitted', async () => {
      const owner = await newUser();
      const op = await store.operators.create({
        legalName: 'Eko Parking Services Ltd',
        tradingName: 'Eko Parking',
        type: 'HOTEL',
        cacNumberEnc: 'enc',
        tinEnc: null,
        addressLine: 'VI',
        contactEmail: 'ops@eko.example',
        contactPhoneEnc: 'enc',
        ownerUserId: owner,
        commissionBps: 1200,
      });
      const file = await store.files.create({
        id: randomUUID(),
        bucket: 'kyb-docs',
        path: `operator/${op.id}/x`,
        dataClass: 'C4',
        retentionPolicy: 'operator_relationship_plus_6y',
        ownerEntityType: 'operator',
        ownerEntityId: op.id,
        uploadedBy: owner,
        mime: 'application/pdf',
        sizeBytes: 10,
        sha256: Buffer.alloc(32, 3),
        createdAt: new Date('2026-10-21T10:00:00Z'),
      });
      await store.files.markVerified(
        file.id,
        { mime: 'application/pdf', sizeBytes: 10, sha256: Buffer.alloc(32, 3) },
        new Date('2026-10-21T10:01:00Z'),
      );
      const doc = await store.kybDocuments.create({
        operatorId: op.id,
        type: 'CAC_CERT',
        fileId: file.id,
      });
      expect(doc).toMatchObject({ type: 'CAC_CERT', status: 'SUBMITTED', rejectionReason: null });
      expect(await store.kybDocuments.list(op.id)).toEqual([
        expect.objectContaining({
          id: doc.id,
          type: 'CAC_CERT',
          mime: 'application/pdf',
          sizeBytes: 10,
          fileStatus: 'VERIFIED',
        }),
      ]);
      expect(await store.kybDocuments.find(randomUUID(), doc.id)).toBeNull();
      await store.kybDocuments.remove(op.id, doc.id);
      expect(await store.kybDocuments.list(op.id)).toEqual([]);
      expect((await store.files.find(file.id))?.status).toBe('REJECTED');

      const first = {
        operatorId: op.id,
        bankCode: '058',
        bankName: 'GTBank',
        accountNumberLast4: '6789',
        accountName: 'EKO PARKING SERVICES LTD',
        pendingAccountNumberEnc: 'enc1',
        nameMismatch: false,
        verifiedAt: new Date('2026-10-21T10:02:00Z'),
      };
      await store.payoutAccounts.upsert(first);
      const second = await store.payoutAccounts.upsert({
        ...first,
        bankCode: '044',
        bankName: 'Access Bank',
        accountNumberLast4: '1111',
        pendingAccountNumberEnc: 'enc2',
      });
      expect(second).toMatchObject({
        bankCode: '044',
        accountNumberLast4: '1111',
        status: 'VERIFIED',
        providerSubaccountCode: null,
      });
      expect((await store.payoutAccounts.find(op.id))?.pendingAccountNumberEnc).toBe('enc2');
      expect(await store.payoutAccounts.find(randomUUID())).toBeNull();

      const submitted = await store.operators.submitKyb(op.id, new Date('2026-10-21T11:00:00Z'));
      expect(submitted.kybStatus).toBe('SUBMITTED');
    });

    it('stores lots scoped to their operator, with versioned edits, hours and photos', async () => {
      const owner = await newUser();
      const op = await store.operators.create({
        legalName: 'Eko Hotels Ltd',
        tradingName: 'Eko Hotel',
        type: 'HOTEL',
        cacNumberEnc: null,
        tinEnc: null,
        addressLine: null,
        contactEmail: null,
        contactPhoneEnc: null,
        ownerUserId: owner,
        commissionBps: 1200,
      });
      const fields = {
        operatorId: op.id,
        type: 'HOTEL' as const,
        name: 'Eko Hotel Car Park',
        slug: `eko-hotel-car-park-${randomUUID().slice(0, 6)}`,
        description: null,
        addressLine: 'Adetokunbo Ademola St',
        area: 'Victoria Island',
        lga: null,
        location: { lat: 6.4281, lng: 3.4219 },
        entranceNotes: null,
        capacityTotal: 300,
        capacityBookable: 120,
        amenities: ['GUARD', 'CCTV'],
        vehicleTypes: ['CAR'],
        createdBy: owner,
      };
      const lot = await store.lots.create(fields);
      expect(lot).toMatchObject({ status: 'DRAFT', version: 1, capacityBookable: 120 });
      expect(lot.location.lat).toBeCloseTo(6.4281, 6);
      expect(lot.location.lng).toBeCloseTo(3.4219, 6);
      await expect(store.lots.create({ ...fields, name: 'Copy' })).rejects.toBeInstanceOf(
        SlugTakenError,
      );

      expect(await store.lots.find(randomUUID(), lot.id)).toBeNull();
      const updated = await store.lots.update(op.id, lot.id, 1, {
        capacityBookable: 150,
        location: { lat: 6.43, lng: 3.42 },
      });
      expect(updated).toMatchObject({ version: 2, capacityBookable: 150 });
      await expect(store.lots.update(op.id, lot.id, 1, { name: 'Stale' })).rejects.toBeInstanceOf(
        StaleVersionError,
      );

      await store.lots.setOpeningHours(lot.id, [
        { weekday: 1, is24h: false, opensAt: '07:00', closesAt: '22:00' },
        { weekday: 0, is24h: true, opensAt: null, closesAt: null },
      ]);
      expect(await store.lots.openingHours(lot.id)).toEqual([
        { weekday: 0, is24h: true, opensAt: null, closesAt: null },
        { weekday: 1, is24h: false, opensAt: '07:00', closesAt: '22:00' },
      ]);
      await store.lots.setOpeningHours(lot.id, []);
      expect(await store.lots.openingHours(lot.id)).toEqual([]);

      const file = await store.files.create({
        id: randomUUID(),
        bucket: 'lot-photos',
        path: `lot/${lot.id}/p1`,
        dataClass: 'C3',
        retentionPolicy: 'lot_life',
        ownerEntityType: 'lot',
        ownerEntityId: lot.id,
        uploadedBy: owner,
        mime: 'image/webp',
        sizeBytes: 2048,
        sha256: Buffer.alloc(32, 4),
        createdAt: new Date('2026-10-21T12:00:00Z'),
      });
      const photo = await store.lotPhotos.create({ lotId: lot.id, fileId: file.id, sort: 0 });
      expect(await store.lotPhotos.list(lot.id)).toEqual([
        expect.objectContaining({ id: photo.id, sort: 0, status: 'PENDING', sizeBytes: 2048 }),
      ]);
      expect((await store.lots.list(op.id)).map((l) => [l.id, l.photoCount])).toEqual([
        [lot.id, 1],
      ]);
      await store.lotPhotos.remove(lot.id, photo.id);
      expect(await store.lotPhotos.list(lot.id)).toEqual([]);
      expect((await store.files.find(file.id))?.status).toBe('REJECTED');
    });

    it('stores permits and rate plans, and moves a lot’s status only from the expected one', async () => {
      const owner = await newUser();
      const op = await store.operators.create({
        legalName: 'P Ltd',
        tradingName: 'P',
        type: 'HOTEL',
        cacNumberEnc: null,
        tinEnc: null,
        addressLine: null,
        contactEmail: null,
        contactPhoneEnc: null,
        ownerUserId: owner,
        commissionBps: 1200,
      });
      const lot = await store.lots.create({
        operatorId: op.id,
        type: 'HOTEL',
        name: 'P Lot',
        slug: `p-lot-${randomUUID().slice(0, 6)}`,
        description: null,
        addressLine: 'VI',
        area: null,
        lga: null,
        location: { lat: 6.43, lng: 3.42 },
        entranceNotes: null,
        capacityTotal: 10,
        capacityBookable: 5,
        amenities: [],
        vehicleTypes: ['CAR'],
        createdBy: owner,
      });
      const file = await store.files.create({
        id: randomUUID(),
        bucket: 'permits',
        path: `lot/${lot.id}/permit`,
        dataClass: 'C3',
        retentionPolicy: 'permit_expiry_plus_6y',
        ownerEntityType: 'lot',
        ownerEntityId: lot.id,
        uploadedBy: owner,
        mime: 'application/pdf',
        sizeBytes: 10,
        sha256: Buffer.alloc(32, 5),
        createdAt: new Date('2026-10-21T12:00:00Z'),
      });
      expect(await store.permits.latest(lot.id)).toBeNull();
      const permit = await store.permits.create({
        lotId: lot.id,
        permitNumber: 'LASPA/2026/0012',
        issuedAt: '2026-01-10',
        expiresAt: '2027-01-09',
        documentFileId: file.id,
        submittedBy: owner,
      });
      expect(permit).toMatchObject({
        status: 'SUBMITTED',
        issuer: 'LASPA',
        expiresAt: '2027-01-09',
      });
      expect((await store.permits.latest(lot.id))?.id).toBe(permit.id);

      const hourly = await store.ratePlans.submit({
        lotId: lot.id,
        product: 'HOURLY',
        hourlyRateKobo: 50_000,
        minMinutes: 60,
        dailyCapKobo: null,
        dailyRateKobo: null,
        monthlyRateKobo: null,
        submittedBy: owner,
      });
      expect(hourly).toMatchObject({ status: 'PENDING_APPROVAL', hourlyRateKobo: 50_000 });
      const changed = await store.ratePlans.submit({
        lotId: lot.id,
        product: 'HOURLY',
        hourlyRateKobo: 60_000,
        minMinutes: 60,
        dailyCapKobo: null,
        dailyRateKobo: null,
        monthlyRateKobo: null,
        submittedBy: owner,
      });
      await store.ratePlans.submit({
        lotId: lot.id,
        product: 'DAILY',
        hourlyRateKobo: null,
        minMinutes: 60,
        dailyCapKobo: null,
        dailyRateKobo: 250_000,
        monthlyRateKobo: null,
        submittedBy: owner,
      });
      const plans = await store.ratePlans.current(lot.id);
      expect(plans.map((p) => [p.product, p.status, p.hourlyRateKobo ?? p.dailyRateKobo])).toEqual([
        ['HOURLY', 'PENDING_APPROVAL', 60_000],
        ['DAILY', 'PENDING_APPROVAL', 250_000],
      ]);
      expect(changed.id).toBe(hourly.id);

      const moved = await store.lots.setStatus(
        op.id,
        lot.id,
        'DRAFT',
        'PENDING_VERIFICATION',
        null,
      );
      expect(moved).toMatchObject({ status: 'PENDING_VERIFICATION', version: 2 });
      await expect(
        store.lots.setStatus(op.id, lot.id, 'DRAFT', 'PENDING_VERIFICATION', null),
      ).rejects.toBeInstanceOf(StaleVersionError);
    });
  });
}
