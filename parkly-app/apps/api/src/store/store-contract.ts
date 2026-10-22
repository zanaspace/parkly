import { randomUUID } from 'node:crypto';
import type { RoleGrant } from '@parkly/domain/authz';
import { generateBookingCode } from '@parkly/domain/codes';
import { describe, expect, it } from 'vitest';
import {
  DsrAlreadyOpenError,
  DuplicatePlateError,
  MemberExistsError,
  OperatorExistsError,
  SlugTakenError,
  StaleVersionError,
  type Store,
} from './types.js';
import type { VerifiedCharge } from '../providers/index.js';

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

    it('adds the driver role once', async () => {
      const id = await newUser([]);
      await store.users.addDriverRole(id);
      await store.users.addDriverRole(id);
      expect(await store.users.roles(id)).toEqual([{ role: 'DRIVER', operatorId: null }]);
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

    it('reviews KYB: queue, reject with reason, approve once with the subaccount saved', async () => {
      const owner = await newUser();
      const op = await store.operators.create({
        legalName: 'R Ltd',
        tradingName: 'R',
        type: 'HOTEL',
        cacNumberEnc: 'enc',
        tinEnc: null,
        addressLine: 'VI',
        contactEmail: 'r@example.com',
        contactPhoneEnc: 'enc',
        ownerUserId: owner,
        commissionBps: 1200,
      });
      await store.payoutAccounts.upsert({
        operatorId: op.id,
        bankCode: '058',
        bankName: 'GTBank',
        accountNumberLast4: '6789',
        accountName: 'R LTD',
        pendingAccountNumberEnc: 'enc-full-number',
        nameMismatch: false,
        verifiedAt: new Date('2026-10-21T10:00:00Z'),
      });
      await store.operators.submitKyb(op.id, new Date('2026-10-21T11:00:00Z'));
      expect((await store.operators.list({ kybStatus: 'SUBMITTED' })).map((o) => o.id)).toContain(
        op.id,
      );

      const rejected = await store.operators.rejectKyb(op.id, {
        reviewerId: owner,
        at: new Date('2026-10-21T12:00:00Z'),
        reason: 'CAC scan unreadable',
      });
      expect(rejected).toMatchObject({
        kybStatus: 'REJECTED',
        kybRejectionReason: 'CAC scan unreadable',
      });
      await expect(
        store.operators.rejectKyb(op.id, { reviewerId: owner, at: new Date(), reason: 'again' }),
      ).rejects.toBeInstanceOf(StaleVersionError);

      const resubmitted = await store.operators.submitKyb(op.id, new Date('2026-10-22T09:00:00Z'));
      expect(resubmitted).toMatchObject({ kybStatus: 'SUBMITTED', kybRejectionReason: null });
      await store.payoutAccounts.setSubaccount(op.id, 'ACCT_test123');
      const approved = await store.operators.approveKyb(op.id, {
        reviewerId: owner,
        at: new Date('2026-10-22T10:00:00Z'),
      });
      expect(approved).toMatchObject({ kybStatus: 'APPROVED', status: 'ACTIVE' });
      expect(await store.payoutAccounts.find(op.id)).toMatchObject({
        status: 'ACTIVE',
        providerSubaccountCode: 'ACCT_test123',
        pendingAccountNumberEnc: null,
      });
      await expect(
        store.operators.approveKyb(op.id, { reviewerId: owner, at: new Date() }),
      ).rejects.toBeInstanceOf(StaleVersionError);
    });

    it('reviews a lot: permit, prices, photos and the site visit, then lists by status', async () => {
      const owner = await newUser();
      const op = await store.operators.create({
        legalName: 'L Ltd',
        tradingName: 'L',
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
        name: 'L Lot',
        slug: `l-lot-${randomUUID().slice(0, 6)}`,
        description: null,
        addressLine: 'VI',
        area: null,
        lga: null,
        location: { lat: 6.43, lng: 3.42 },
        entranceNotes: null,
        capacityTotal: 40,
        capacityBookable: 30,
        amenities: [],
        vehicleTypes: ['CAR'],
        createdBy: owner,
      });
      const file = (bucket: 'permits' | 'lot-photos' | 'lot-photos-public') =>
        store.files.create({
          id: randomUUID(),
          bucket,
          path: `lot/${lot.id}/${randomUUID()}`,
          dataClass: bucket === 'lot-photos-public' ? 'C1' : 'C3',
          retentionPolicy: 'lot_life',
          ownerEntityType: 'lot',
          ownerEntityId: lot.id,
          uploadedBy: owner,
          mime: 'image/webp',
          sizeBytes: 10,
          sha256: Buffer.alloc(32, 6),
          createdAt: new Date('2026-10-21T12:00:00Z'),
        });
      const reviewer = { reviewerId: owner, at: new Date('2026-10-22T10:00:00Z') };

      await store.lots.setStatus(op.id, lot.id, 'DRAFT', 'PENDING_VERIFICATION', null);
      const queue = await store.lots.listByStatus('PENDING_VERIFICATION');
      expect(queue.find((l) => l.id === lot.id)).toMatchObject({
        operatorName: 'L Ltd',
        photoCount: 0,
      });
      expect((await store.lots.findById(lot.id))?.operatorId).toBe(op.id);

      // Permit: approve once, with the LASPA check note.
      const permit = await store.permits.create({
        lotId: lot.id,
        permitNumber: 'LASPA/2026/0099',
        issuedAt: '2026-01-10',
        expiresAt: '2027-01-09',
        documentFileId: (await file('permits')).id,
        submittedBy: owner,
      });
      expect(
        await store.permits.approve(permit.id, { ...reviewer, note: 'Phoned LASPA' }),
      ).toMatchObject({ status: 'APPROVED', reviewNote: 'Phoned LASPA' });
      await expect(
        store.permits.reject(permit.id, { ...reviewer, reason: 'too late' }),
      ).rejects.toBeInstanceOf(StaleVersionError);

      // Prices: approving a change retires the live price for that product.
      const price = (hourlyRateKobo: number) =>
        store.ratePlans.submit({
          lotId: lot.id,
          product: 'HOURLY',
          hourlyRateKobo,
          minMinutes: 60,
          dailyCapKobo: null,
          dailyRateKobo: null,
          monthlyRateKobo: null,
          submittedBy: owner,
        });
      const first = await price(50_000);
      await store.ratePlans.approve(first.id, reviewer);
      const second = await price(70_000);
      expect(await store.ratePlans.approve(second.id, reviewer)).toMatchObject({
        status: 'ACTIVE',
      });
      expect((await store.ratePlans.find(first.id))?.status).toBe('RETIRED');
      const third = await price(90_000);
      expect(
        await store.ratePlans.reject(third.id, { ...reviewer, reason: 'Too steep' }),
      ).toMatchObject({ status: 'REJECTED', rejectionReason: 'Too steep' });
      await expect(store.ratePlans.approve(third.id, reviewer)).rejects.toBeInstanceOf(
        StaleVersionError,
      );
      expect((await store.ratePlans.current(lot.id)).map((p) => p.hourlyRateKobo)).toEqual([
        70_000,
      ]);
      expect((await store.ratePlans.latestRejected(lot.id)).map((p) => p.id)).toEqual([third.id]);
      await price(95_000);
      expect(
        (await store.lots.listByStatus('PENDING_VERIFICATION')).find((l) => l.id === lot.id),
      ).toMatchObject({ pendingPriceCount: 1 });

      // Photos: approval records the public copy, once.
      const photo = await store.lotPhotos.create({
        lotId: lot.id,
        fileId: (await file('lot-photos')).id,
        sort: 0,
      });
      const publicCopy = await file('lot-photos-public');
      const approved = await store.lotPhotos.review(
        photo.id,
        { status: 'APPROVED', publicFileId: publicCopy.id },
        reviewer,
      );
      expect(approved).toMatchObject({ status: 'APPROVED', publicFileId: publicCopy.id });
      expect((await store.lotPhotos.findById(photo.id))?.lotId).toBe(lot.id);
      await expect(
        store.lotPhotos.review(photo.id, { status: 'REJECTED' }, reviewer),
      ).rejects.toBeInstanceOf(StaleVersionError);

      // Site visit: a lower count on approval replaces the lot's capacity.
      const visit = await store.verifications.create({
        lotId: lot.id,
        inspectorUserId: owner,
        inspectedAt: new Date('2026-10-21T15:00:00Z'),
        capacityCounted: 25,
        gps: { lat: 6.4301, lng: 3.4202 },
        notes: null,
        validUntil: '2027-10-21',
        items: [
          { item: 'LASPA_PERMIT', result: 'PASS', comment: null },
          { item: 'CCTV', result: 'NA', comment: 'None' },
        ],
      });
      expect(visit).toMatchObject({ status: 'SUBMITTED', gps: { lat: 6.4301, lng: 3.4202 } });
      const latest = await store.verifications.latest(lot.id);
      expect(latest?.items.map((i) => i.item).sort()).toEqual(['CCTV', 'LASPA_PERMIT']);
      expect(await store.verifications.approve(visit.id, reviewer)).toMatchObject({
        status: 'APPROVED',
        validUntil: '2027-10-21',
      });
      expect(await store.lots.findById(lot.id)).toMatchObject({
        capacityTotal: 25,
        capacityBookable: 25,
      });
      await expect(
        store.verifications.reject(visit.id, { ...reviewer, reason: 'late' }),
      ).rejects.toBeInstanceOf(StaleVersionError);
      expect(await store.flags.enabled('no_such_flag')).toBe(false);

      const live = await store.lots.setStatus(op.id, lot.id, 'PENDING_VERIFICATION', 'LIVE', null);
      expect(live.status).toBe('LIVE');
      expect((await store.lots.listByStatus('LIVE')).map((l) => l.id)).toContain(lot.id);
    });

    it('finds permits due a reminder or expiry, records reminders and expires once', async () => {
      const owner = await newUser();
      const op = await store.operators.create({
        legalName: 'X Ltd',
        tradingName: 'X',
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
        name: 'X Lot',
        slug: `x-lot-${randomUUID().slice(0, 6)}`,
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
      const reviewer = { reviewerId: owner, at: new Date('2026-10-01T10:00:00Z') };
      const approved = async (expiresAt: string) => {
        const p = await store.permits.create({
          lotId: lot.id,
          permitNumber: `LASPA/${expiresAt}`,
          issuedAt: '2026-01-01',
          expiresAt,
          documentFileId: (
            await store.files.create({
              id: randomUUID(),
              bucket: 'permits',
              path: `x/${randomUUID()}`,
              dataClass: 'C3',
              retentionPolicy: 'permit_expiry_plus_6y',
              ownerEntityType: 'lot',
              ownerEntityId: lot.id,
              uploadedBy: owner,
              mime: 'application/pdf',
              sizeBytes: 10,
              sha256: Buffer.alloc(32, 7),
              createdAt: new Date('2026-10-01T00:00:00Z'),
            })
          ).id,
          submittedBy: owner,
        });
        return store.permits.approve(p.id, { ...reviewer, note: 'checked' });
      };
      // Far future dates keep other tests' permits out of the window.
      const today = '2031-03-01';
      const expired = await approved('2031-03-01');
      const in10 = await approved('2031-03-11');
      const in40 = await approved('2031-04-10');
      const mine = (rows: { id: string }[]) =>
        rows.map((r) => r.id).filter((id) => [expired.id, in10.id, in40.id].includes(id));

      expect(mine(await store.permits.dueForExpiryCheck(today, 50))).toEqual([expired.id, in10.id]);
      await store.permits.markReminded(in10.id, 14);
      expect(mine(await store.permits.dueForExpiryCheck(today, 50))).toEqual([expired.id]);
      await store.permits.markReminded(in10.id, 30); // never moves backwards
      expect((await store.permits.find(in10.id))?.lastReminderDays).toBe(14);
      expect(mine(await store.permits.dueForExpiryCheck('2031-03-05', 50))).toEqual([
        expired.id,
        in10.id,
      ]);

      expect(await store.permits.expire(expired.id)).toBe(true);
      expect(await store.permits.expire(expired.id)).toBe(false);
      expect((await store.permits.find(expired.id))?.status).toBe('EXPIRED');
      expect(mine(await store.permits.dueForExpiryCheck(today, 50))).toEqual([]);
    });

    it('invites, accepts once with the role grant, removes, and scopes attendants to lots', async () => {
      const owner = await newUser();
      const op = await store.operators.create({
        legalName: 'T Ltd',
        tradingName: 'T',
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
        name: 'T Lot',
        slug: `t-lot-${randomUUID().slice(0, 6)}`,
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
      expect((await store.members.list(op.id)).map((m) => [m.role, m.status, m.userId])).toEqual([
        ['OWNER', 'ACTIVE', owner],
      ]);

      const now = new Date('2026-10-21T10:00:00Z');
      const phoneHash = Buffer.from(randomUUID());
      const token = Buffer.from(randomUUID());
      const invite = await store.members.invite({
        operatorId: op.id,
        role: 'ATTENDANT',
        lotIds: [],
        inviteeName: 'Musa',
        inviteePhoneHash: phoneHash,
        inviteeEmailHash: null,
        inviteTokenHash: token,
        inviteExpiresAt: new Date('2026-10-24T10:00:00Z'),
        invitedBy: owner,
      });
      expect(invite).toMatchObject({ status: 'INVITED', userId: null, inviteeName: 'Musa' });
      expect(
        (await store.members.findByContact(op.id, { phoneHash, emailHash: null }, now))?.id,
      ).toBe(invite.id);
      expect(
        await store.members.findByContact(
          op.id,
          { phoneHash, emailHash: null },
          new Date('2026-10-25T00:00:00Z'),
        ),
      ).toBeNull();
      expect((await store.members.findByToken(token))?.inviteePhoneHash?.equals(phoneHash)).toBe(
        true,
      );

      const attendant = await newUser();
      const accepted = await store.members.accept(invite.id, attendant, now);
      expect(accepted).toMatchObject({ status: 'ACTIVE', userId: attendant });
      expect(await store.users.roles(attendant)).toEqual(
        expect.arrayContaining([{ role: 'OPERATOR_ATTENDANT', operatorId: op.id }]),
      );
      expect(await store.members.findByToken(token)).toBeNull();
      await expect(store.members.accept(invite.id, attendant, now)).rejects.toBeInstanceOf(
        StaleVersionError,
      );
      expect(await store.members.attendantLotIds(attendant)).toEqual([lot.id]);

      // The owner accepting an invite to their own operator is refused.
      const second = await store.members.invite({
        operatorId: op.id,
        role: 'MANAGER',
        lotIds: [],
        inviteeName: 'Owner again',
        inviteePhoneHash: null,
        inviteeEmailHash: Buffer.from(randomUUID()),
        inviteTokenHash: Buffer.from(randomUUID()),
        inviteExpiresAt: new Date('2026-10-24T10:00:00Z'),
        invitedBy: owner,
      });
      await expect(store.members.accept(second.id, owner, now)).rejects.toBeInstanceOf(
        MemberExistsError,
      );

      const removed = await store.members.remove(op.id, invite.id, now);
      expect(removed.status).toBe('REMOVED');
      expect(
        (await store.users.roles(attendant)).some((r) => r.role === 'OPERATOR_ATTENDANT'),
      ).toBe(false);
      expect(await store.members.attendantLotIds(attendant)).toEqual([]);
      await expect(store.members.remove(op.id, invite.id, now)).rejects.toBeInstanceOf(
        StaleVersionError,
      );
      expect((await store.members.list(op.id)).map((m) => m.inviteeName ?? 'owner')).toEqual([
        'owner',
        'Owner again',
      ]);
    });

    describe('bookings and payments (Sprint 4)', () => {
      const START = new Date('2027-01-05T07:00:00Z');
      const END = new Date('2027-01-05T09:00:00Z');
      const AT = new Date('2027-01-04T10:00:00Z');

      async function liveLot(capacity: number) {
        const owner = await newUser([]);
        const op = await store.operators.create({
          legalName: 'Hold Ltd',
          tradingName: 'Hold',
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
          name: 'Hold lot',
          slug: `hold-${randomUUID()}`,
          description: null,
          addressLine: '1 Road',
          area: null,
          lga: null,
          location: { lat: 6.43, lng: 3.42 },
          entranceNotes: null,
          capacityTotal: capacity + 1,
          capacityBookable: capacity,
          amenities: [],
          vehicleTypes: ['CAR'],
          createdBy: owner,
        });
        const plan = await store.ratePlans.submit({
          lotId: lot.id,
          product: 'HOURLY',
          hourlyRateKobo: 50_000,
          minMinutes: 60,
          dailyCapKobo: null,
          dailyRateKobo: null,
          monthlyRateKobo: null,
          submittedBy: owner,
        });
        await store.lots.setStatus(op.id, lot.id, 'DRAFT', 'PENDING_VERIFICATION', null);
        await store.lots.setStatus(op.id, lot.id, 'PENDING_VERIFICATION', 'LIVE', null);
        return { lotId: lot.id, operatorId: op.id, ratePlanId: plan.id };
      }

      async function driver() {
        const id = await newUser();
        const v = await store.vehicles.create({
          userId: id,
          plateRaw: 'LND 123 AB',
          plateNorm: 'LND123AB',
          make: null,
          model: null,
          colour: null,
          isDefault: true,
        });
        return { id, vehicleId: v.id };
      }

      type Lot = Awaited<ReturnType<typeof liveLot>>;
      const hold = (lot: Lot, d: { id: string; vehicleId: string }) =>
        store.bookings.hold(
          {
            id: randomUUID(),
            code: generateBookingCode(),
            driverId: d.id,
            vehicleId: d.vehicleId,
            plateNorm: 'LND123AB',
            lotId: lot.lotId,
            product: 'HOURLY',
            startAt: START,
            endAt: END,
            holdExpiresAt: new Date(AT.getTime() + 10 * 60_000),
            priceKobo: 100_000,
            serviceFeeKobo: 10_000,
            commissionBps: 1200,
            ratePlanId: lot.ratePlanId,
            pricingBreakdown: [],
            source: 'MOBILE',
          },
          {
            id: randomUUID(),
            payerUserId: d.id,
            provider: 'FAKE',
            amountKobo: 110_000,
            platformAmountKobo: 22_000,
            operatorAmountKobo: 88_000,
            operatorId: lot.operatorId,
            subaccountCode: null,
          },
          AT,
        );

      const checkout = { authorizationUrl: 'https://checkout.example/x', accessCode: 'x' };

      const charge = (over: Partial<VerifiedCharge> = {}): VerifiedCharge => ({
        status: 'success',
        amountKobo: 110_000,
        currency: 'NGN',
        paidAt: AT,
        feesKobo: 1_500,
        channel: 'card',
        cardLast4: '4081',
        cardBrand: 'visa',
        ...over,
      });

      it('holds a space per booking and refuses a full lot or a car booked twice', async () => {
        const lot = await liveLot(1);
        const first = await driver();
        const { booking, payment } = await hold(lot, first);
        expect(booking).toMatchObject({ status: 'PENDING_PAYMENT', totalKobo: 110_000 });
        expect(payment).toMatchObject({ status: 'INITIATED', bookingId: booking.id });
        await expect(hold(lot, first)).rejects.toMatchObject({
          code: 'BOOKING_OVERLAP_SAME_VEHICLE',
        });
        await expect(hold(lot, await driver())).rejects.toMatchObject({
          code: 'BOOKING_SLOT_UNAVAILABLE',
        });
        const slots = await store.inventory.slots([lot.lotId], START, END);
        expect(slots.map((s) => s.held)).toEqual(Array(8).fill(1));
      });

      it('confirms a paid hold once and lists it', async () => {
        const lot = await liveLot(2);
        const d = await driver();
        const { booking, payment } = await hold(lot, d);
        const started = await store.payments.checkoutStarted(payment.id, checkout, AT);
        expect(started.status).toBe('PENDING');
        const settled = await store.payments.settle(payment.id, charge(), AT);
        expect(settled).toMatchObject({
          decision: 'CONFIRM',
          booking: { status: 'CONFIRMED', holdExpiresAt: null },
          payment: { status: 'SUCCEEDED' },
          refund: null,
        });
        expect((await store.payments.settle(payment.id, charge(), AT)).decision).toBe('NOOP');
        const slots = await store.inventory.slots([lot.lotId], START, END);
        expect(slots.every((s) => s.held === 0 && s.booked === 1)).toBe(true);
        const upcoming = await store.bookings.listForDriver(d.id, 'upcoming', AT, 10);
        expect(upcoming.map((b) => b.id)).toEqual([booking.id]);
        expect(await store.bookings.listForDriver(d.id, 'past', AT, 10)).toEqual([]);
        expect((await store.payments.latestForBooking(booking.id))?.id).toBe(payment.id);
      });

      it('fails a payment that never reached the provider when its hold is released', async () => {
        const lot = await liveLot(1);
        const a = await hold(lot, await driver());
        await store.bookings.releaseHold(a.booking.id, 'checkout.failed', AT);
        expect((await store.bookings.find(a.booking.id))?.status).toBe('EXPIRED');
        expect((await store.payments.find(a.payment.id))?.status).toBe('FAILED');
      });

      it('re-books late money when a space is free', async () => {
        const lot = await liveLot(1);
        const b = await hold(lot, await driver());
        await store.payments.checkoutStarted(b.payment.id, checkout, AT);
        await store.bookings.releaseHold(b.booking.id, 'hold.expired', AT);
        expect((await store.payments.find(b.payment.id))?.status).toBe('PENDING');
        expect(await store.payments.settle(b.payment.id, charge(), AT)).toMatchObject({
          decision: 'REACQUIRE_AND_CONFIRM',
          booking: { status: 'CONFIRMED' },
        });
        const slots = await store.inventory.slots([lot.lotId], START, END);
        expect(slots.every((s) => s.held === 0 && s.booked === 1)).toBe(true);
      });

      it('refunds late money when the space is gone', async () => {
        const lot = await liveLot(1);
        const held = await hold(lot, await driver());
        await store.payments.checkoutStarted(held.payment.id, checkout, AT);
        await store.bookings.releaseHold(held.booking.id, 'hold.expired', AT);
        await hold(lot, await driver());
        const refunded = await store.payments.settle(held.payment.id, charge(), AT);
        expect(refunded).toMatchObject({
          decision: 'REFUND_HOLD_EXPIRED',
          booking: { status: 'EXPIRED' },
          payment: { status: 'SUCCEEDED' },
          refund: { amountKobo: 110_000 },
        });
        await store.payments.refundRequested(refunded.refund?.id ?? '', 'rf_1');
      });

      it('fails a declined charge and frees the space', async () => {
        const lot = await liveLot(1);
        const { payment, booking } = await hold(lot, await driver());
        const failed = await store.payments.settle(payment.id, charge({ status: 'failed' }), AT);
        expect(failed).toMatchObject({
          decision: 'FAIL',
          booking: { status: 'EXPIRED' },
          payment: { status: 'FAILED' },
        });
        const slots = await store.inventory.slots([lot.lotId], START, END);
        expect(slots.every((s) => s.held === 0)).toBe(true);
        expect((await store.bookings.find(booking.id))?.holdExpiresAt).toBeNull();
      });

      it('stores a webhook once', async () => {
        const event = {
          provider: 'FAKE' as const,
          dedupeKey: `charge.success:${randomUUID()}:1`,
          eventType: 'charge.success',
          reference: null,
          payload: { event: 'charge.success' },
          at: AT,
        };
        const first = await store.webhooks.record(event);
        expect(first.duplicate).toBe(false);
        expect(await store.webhooks.record(event)).toEqual({ id: first.id, duplicate: true });
        await store.webhooks.finish(first.id, 'PROCESSED', null, AT);
      });

      it('registers, approves and blocks attendant phones', async () => {
        const lot = await liveLot(1);
        const attendant = await newUser([]);
        const phone = randomUUID();
        const reg = await store.attend.registerDevice({
          userId: attendant,
          clientDeviceId: phone,
          operatorId: lot.operatorId,
          lotId: lot.lotId,
          approve: false,
          at: AT,
        });
        expect(reg).toMatchObject({ lotId: lot.lotId, approvedAt: null, revokedAt: null });
        await store.attend.decideDevice({
          operatorId: lot.operatorId,
          deviceId: reg.id,
          decision: 'approve',
          by: attendant,
          at: AT,
        });
        expect((await store.attend.device(attendant, phone))?.approvedAt).not.toBeNull();
        await store.attend.decideDevice({
          operatorId: lot.operatorId,
          deviceId: reg.id,
          decision: 'revoke',
          by: attendant,
          at: AT,
        });
        const again = await store.attend.registerDevice({
          userId: attendant,
          clientDeviceId: phone,
          operatorId: lot.operatorId,
          lotId: lot.lotId,
          approve: true,
          at: AT,
        });
        expect(again.revokedAt).not.toBeNull();
        expect(
          await store.attend.decideDevice({
            operatorId: randomUUID(),
            deviceId: reg.id,
            decision: 'approve',
            by: attendant,
            at: AT,
          }),
        ).toBeNull();
        const listed = await store.attend.operatorDevices(lot.operatorId);
        expect(listed).toEqual([expect.objectContaining({ id: reg.id, lotName: 'Hold lot' })]);
      });

      it('syncs check-in, check-out and walk-ins once, and lists them in the manifest', async () => {
        const lot = await liveLot(2);
        const attendant = await newUser([]);
        const { booking, payment } = await hold(lot, await driver());
        await store.payments.settle(payment.id, charge(), AT);
        const batch = (id = randomUUID()) => ({
          id,
          deviceId: randomUUID(),
          lotId: lot.lotId,
          attendantId: attendant,
          deviceSentAt: new Date('2027-01-05T07:30:00Z'),
          receivedAt: new Date('2027-01-05T07:30:00Z'),
        });
        const inEvent = {
          type: 'CHECK_IN' as const,
          clientEventId: randomUUID(),
          deviceTime: new Date('2027-01-05T07:05:00Z'),
          bookingId: booking.id,
          method: 'QR' as const,
          plateSeen: 'LND123AB',
          overrideReason: null,
        };
        const b1 = batch();
        const first = await store.attend.applyBatch(b1, [
          inEvent,
          {
            type: 'WALK_IN',
            clientEventId: randomUUID(),
            deviceTime: new Date('2027-01-05T07:06:00Z'),
            delta: 1,
          },
        ]);
        expect(first.results.map((r) => r.result)).toEqual(['APPLIED', 'APPLIED']);
        expect((await store.bookings.find(booking.id))?.status).toBe('CHECKED_IN');
        expect(await store.attend.walkIns(lot.lotId)).toBe(1);
        expect((await store.attend.applyBatch(b1, [inEvent])).results[0]?.result).toBe('DUPLICATE');
        expect((await store.attend.applyBatch(batch(), [inEvent])).results[0]?.result).toBe(
          'DUPLICATE',
        );

        const out = await store.attend.applyBatch(batch(), [
          {
            type: 'CHECK_OUT',
            clientEventId: randomUUID(),
            deviceTime: new Date('2027-01-05T09:40:00Z'),
            bookingId: booking.id,
            method: 'CODE',
          },
        ]);
        expect(out.results[0]?.result).toBe('APPLIED');
        expect(out.checkedOut).toHaveLength(1);
        expect((await store.bookings.find(booking.id))?.status).toBe('COMPLETED');
        const s = await store.attend.session(out.checkedOut[0] ?? '');
        expect(s).toMatchObject({ bookingId: booking.id, commissionBps: 1200 });
        await store.attend.setOverstay(out.checkedOut[0] ?? '', 30, 25_000);

        const manifest = await store.attend.manifest(lot.lotId, START, END);
        expect(manifest).toEqual([
          expect.objectContaining({
            id: booking.id,
            status: 'COMPLETED',
            checkedInAt: new Date('2027-01-05T07:05:00Z'),
            checkedOutAt: new Date('2027-01-05T09:40:00Z'),
          }),
        ]);
        expect(await store.lotKeys.forManifest(lot.lotId)).toEqual({ valid: [], revokedKids: [] });
      });

      it('claims, replays and frees idempotency keys', async () => {
        const actorId = await newUser();
        const k = {
          actorId,
          key: `key-${randomUUID()}`,
          method: 'POST',
          path: '/v1/bookings',
          requestHash: 'a'.repeat(64),
          expiresAt: new Date('2027-01-06T00:00:00Z'),
        };
        expect(await store.idempotency.begin(k)).toEqual({ state: 'new' });
        expect(await store.idempotency.begin(k)).toEqual({ state: 'in_progress' });
        await store.idempotency.complete(actorId, k.key, 201, { ok: true });
        expect(await store.idempotency.begin(k)).toEqual({
          state: 'replay',
          status: 201,
          body: { ok: true },
        });
        expect(await store.idempotency.begin({ ...k, requestHash: 'b'.repeat(64) })).toEqual({
          state: 'mismatch',
        });
        const other = { ...k, key: `key-${randomUUID()}` };
        await store.idempotency.begin(other);
        await store.idempotency.release(actorId, other.key);
        expect(await store.idempotency.begin(other)).toEqual({ state: 'new' });
      });
    });

    it('keeps one active QR signing key per lot', async () => {
      const owner = await newUser([]);
      const op = await store.operators.create({
        legalName: 'Key Ltd',
        tradingName: 'Key',
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
        name: 'Key lot',
        slug: `key-${randomUUID()}`,
        description: null,
        addressLine: '1 Road',
        area: null,
        lga: null,
        location: { lat: 6.43, lng: 3.42 },
        entranceNotes: null,
        capacityTotal: 2,
        capacityBookable: 1,
        amenities: [],
        vehicleTypes: ['CAR'],
        createdBy: owner,
      });
      expect(await store.lotKeys.active(lot.id)).toBeNull();
      const key = (kid: string) => ({
        id: randomUUID(),
        lotId: lot.id,
        kid,
        publicKey: Buffer.alloc(32, 1),
        privateKeyCiphertext: 'v1:ciphertext',
        activatedAt: new Date('2027-01-04T10:00:00Z'),
      });
      const first = await store.lotKeys.createActive(key(`kid-${randomUUID()}`));
      const second = await store.lotKeys.createActive(key(`kid-${randomUUID()}`));
      expect(second.kid).toBe(first.kid);
      expect(await store.lotKeys.active(lot.id)).toMatchObject({
        kid: first.kid,
        status: 'ACTIVE',
        privateKeyCiphertext: 'v1:ciphertext',
      });
      expect(Buffer.from((await store.lotKeys.active(lot.id))?.publicKey ?? [])).toEqual(
        Buffer.alloc(32, 1),
      );
    });
  });
}
