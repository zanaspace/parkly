import { describe, expect, it } from 'vitest';
import { world } from '../../test-helpers.js';

describe('Corporate Tenancy API (Sprint CORP-01)', () => {
  it('returns 404 for unknown corporate slug', async () => {
    const w = world();
    const res = await w.call('GET', '/v1/corp/unknown-org');
    expect(res.status).toBe(404);
    expect((res.body as { code?: string })?.code).toBe('NOT_FOUND');
  });

  it('returns 200 with public branding and email domains for registered corporate tenant', async () => {
    const w = world();

    const account = await w.store.corporate.createAccount({
      slug: 'zenith',
      legalName: 'Zenith Bank PLC',
      cacRcNumber: 'RC123456',
      industry: 'BANKING',
      headOfficeAddress: 'Plot 84, Ajose Adeogun Street, Victoria Island, Lagos',
      primaryContactName: 'Ebenezer Onyeagwu',
      primaryContactEmail: 'contact@zenithbank.com',
      primaryContactPhone: '+2348030001122',
      billingTier: 'ENTERPRISE',
    });

    await w.store.corporate.setBranding(account.id, {
      logoUrl: 'https://cdn.parkly.ng/corp/zenith/logo.png',
      primaryColor: '#E31837',
      secondaryColor: '#1E1E1E',
      portalTitle: 'Zenith Bank Workplace Parking',
      welcomeMessage: 'Welcome to Zenith Bank staff and executive parking portal.',
    });

    await w.store.corporate.addDomain(account.id, {
      subdomain: 'zenith',
      customDomain: 'parking.zenithbank.com',
      emailDomain: 'zenithbank.com',
      isVerified: true,
    });

    const res = await w.call('GET', '/v1/corp/zenith');
    expect(res.status).toBe(200);
    const body = res.body as {
      id: string;
      slug: string;
      legalName: string;
      industry: string;
      branding: {
        logoUrl: string;
        primaryColor: string;
        portalTitle: string;
      } | null;
      emailDomains: string[];
    };

    expect(body.slug).toBe('zenith');
    expect(body.legalName).toBe('Zenith Bank PLC');
    expect(body.industry).toBe('BANKING');
    expect(body.branding?.logoUrl).toBe('https://cdn.parkly.ng/corp/zenith/logo.png');
    expect(body.branding?.primaryColor).toBe('#E31837');
    expect(body.emailDomains).toContain('zenithbank.com');
  });

  it('resolves subdomain and custom domain for Edge Middleware routing', async () => {
    const w = world();

    const account = await w.store.corporate.createAccount({
      slug: 'kpmg',
      legalName: 'KPMG Nigeria',
      cacRcNumber: 'RC789012',
      industry: 'CONSULTING',
      headOfficeAddress: 'KPMG Tower, Bishop Aboyade Cole Street, Victoria Island, Lagos',
      primaryContactName: 'Bisi Lamikanra',
      primaryContactEmail: 'info@kpmg.ng',
      primaryContactPhone: '+2348099887766',
    });

    await w.store.corporate.addDomain(account.id, {
      subdomain: 'kpmg',
      customDomain: 'parking.kpmg.ng',
      emailDomain: 'kpmg.ng',
      isVerified: true,
    });

    // 1. Resolve via subdomain
    const res1 = await w.call('GET', '/v1/corp/resolve?domain=kpmg');
    expect(res1.status).toBe(200);
    expect((res1.body as { slug: string; legalName: string })?.slug).toBe('kpmg');
    expect((res1.body as { legalName: string })?.legalName).toBe('KPMG Nigeria');

    // 2. Resolve via custom CNAME domain
    const res2 = await w.call('GET', '/v1/corp/resolve?domain=parking.kpmg.ng');
    expect(res2.status).toBe(200);
    expect((res2.body as { slug: string; customDomain: string | null })?.customDomain).toBe(
      'parking.kpmg.ng',
    );

    // 3. Resolve unknown domain
    const res3 = await w.call('GET', '/v1/corp/resolve?domain=unknown-corp.ng');
    expect(res3.status).toBe(404);
  });

  it('registers and onboards a new corporate tenant via POST /v1/corp/onboard', async () => {
    const w = world();

    const payload = {
      legalName: 'Access Holdings PLC',
      cacRcNumber: 'RC554433',
      slug: 'access',
      industry: 'Banking',
      headOfficeAddress: '14/15 Prince Alaba Oniru Street, Victoria Island, Lagos',
      primaryContactName: 'Roosevelt Ogbonna',
      primaryContactEmail: 'admin@accessbankplc.com',
      primaryContactPhone: '+2348022334455',
      emailDomain: 'accessbankplc.com',
      branding: {
        logoUrl: 'https://cdn.parkly.ng/corp/access/logo.png',
        primaryColor: '#F58220',
        secondaryColor: '#1E1E1E',
        portalTitle: 'Access Bank Employee Mobility & Commute Portal',
        welcomeMessage: 'Welcome to Access Bank corporate parking.',
      },
    };

    const res = await w.call('POST', '/v1/corp/onboard', { body: payload });
    expect(res.status).toBe(201);
    const body = res.body as {
      slug: string;
      legalName: string;
      branding: { primaryColor: string; portalTitle: string };
      emailDomains: string[];
    };
    expect(body.slug).toBe('access');
    expect(body.legalName).toBe('Access Holdings PLC');
    expect(body.branding.primaryColor).toBe('#F58220');
    expect(body.emailDomains).toContain('accessbankplc.com');

    // Confirm it can immediately be fetched via GET /v1/corp/access
    const fetchRes = await w.call('GET', '/v1/corp/access');
    expect(fetchRes.status).toBe(200);

    // Conflict test: duplicate slug
    const dupRes = await w.call('POST', '/v1/corp/onboard', { body: payload });
    expect(dupRes.status).toBe(409);
  });

  it('updates corporate profile details and branding via PATCH /v1/corp/:slug', async () => {
    const w = world();

    const acct = await w.store.corporate.createAccount({
      slug: 'sellyticshq',
      legalName: 'Sellytics Global HQ',
      cacRcNumber: 'RC998877',
      industry: 'Technology',
      headOfficeAddress: 'Victoria Island, Lagos',
      primaryContactName: 'Chief Operator',
      primaryContactEmail: 'ops@sellyticshq.com',
      primaryContactPhone: '+2348011223344',
    });

    await w.store.corporate.addDomain(acct.id, {
      subdomain: 'sellyticshq',
      emailDomain: 'sellyttichq.com',
    });

    const updatePayload = {
      legalName: 'Sellytics Enterprise Technologies Ltd',
      headOfficeAddress: 'Admiralty Way, Lekki Phase 1, Lagos',
      emailDomain: 'sellyticshq.com',
      branding: {
        primaryColor: '#00C48C',
        secondaryColor: '#111827',
        portalTitle: 'Sellytics Smart Commute & Fleet Transit',
        welcomeMessage: 'Premium employer parking for engineers and drivers.',
      },
    };

    const res = await w.call('PATCH', '/v1/corp/sellyticshq', { body: updatePayload });
    expect(res.status).toBe(200);
    const body = res.body as {
      legalName: string;
      headOfficeAddress?: string;
      emailDomains: string[];
      branding: { primaryColor: string; portalTitle: string; welcomeMessage: string };
    };

    expect(body.legalName).toBe('Sellytics Enterprise Technologies Ltd');
    expect(body.headOfficeAddress).toBe('Admiralty Way, Lekki Phase 1, Lagos');
    expect(body.emailDomains).toContain('sellyticshq.com');
    expect(body.branding.primaryColor).toBe('#00C48C');
    expect(body.branding.portalTitle).toBe('Sellytics Smart Commute & Fleet Transit');
    expect(body.branding.welcomeMessage).toBe(
      'Premium employer parking for engineers and drivers.',
    );
  });

  it('supports field driver roster management, join code verification, and admin approval', async () => {
    const w = world();

    await w.store.corporate.createAccount({
      slug: 'dangote-fleet',
      legalName: 'Dangote Cement Fleet Operations',
      cacRcNumber: 'RC112233',
      industry: 'Logistics',
      headOfficeAddress: 'Ikoyi, Lagos',
      primaryContactName: 'Fleet Admin',
      primaryContactEmail: 'fleet@dangote.com',
      primaryContactPhone: '+2348055667788',
    });

    // 1. Admin adds a field driver
    const addRes = await w.call('POST', '/v1/corp/dangote-fleet/drivers', {
      body: {
        driverName: 'Ibrahim Musa',
        phone: '+2348099112233',
        vehiclePlate: 'KJA-882-XD',
      },
    });

    expect(addRes.status).toBe(201);
    const driver = addRes.body as {
      id: string;
      driverName: string;
      phone: string;
      vehiclePlate: string;
      joinCode: string;
      approvalStatus: string;
    };

    expect(driver.driverName).toBe('Ibrahim Musa');
    expect(driver.phone).toBe('+2348099112233');
    expect(driver.vehiclePlate).toBe('KJA-882-XD');
    expect(driver.joinCode).toMatch(/^DAN-\d{4}$/);
    expect(driver.approvalStatus).toBe('PENDING_APPROVAL');

    // 2. Listing drivers returns the added driver
    const listRes = await w.call('GET', '/v1/corp/dangote-fleet/drivers');
    expect(listRes.status).toBe(200);
    const list = listRes.body as unknown as Array<{ id: string; joinCode: string }>;
    expect(list.length).toBe(1);
    expect(list[0]?.id).toBe(driver.id);

    // 3. Driver joins using Phone + Join Code without SMS OTP
    // Attempt with wrong phone number fails
    const failJoin = await w.call('POST', '/v1/corp/drivers/join', {
      body: {
        phone: '+2348000000000',
        joinCode: driver.joinCode,
      },
    });
    expect(failJoin.status).toBe(403);

    // Valid phone + join code succeeds
    const joinRes = await w.call('POST', '/v1/corp/drivers/join', {
      body: {
        phone: '+2348099112233',
        joinCode: driver.joinCode,
      },
    });
    expect(joinRes.status).toBe(200);
    const joinData = joinRes.body as {
      success: boolean;
      driver: { id: string; approvalStatus: string };
      corporate: { slug: string; legalName: string };
    };
    expect(joinData.success).toBe(true);
    expect(joinData.driver.approvalStatus).toBe('PENDING_APPROVAL');
    expect(joinData.corporate.slug).toBe('dangote-fleet');

    // 4. Admin approves the driver
    const approveRes = await w.call('PATCH', `/v1/corp/dangote-fleet/drivers/${driver.id}/status`, {
      body: { approvalStatus: 'APPROVED' },
    });
    expect(approveRes.status).toBe(200);
    const approvedDriver = approveRes.body as { approvalStatus: string };
    expect(approvedDriver.approvalStatus).toBe('APPROVED');

    // 5. Admin updates driver details (name, phone, and vehicle plate)
    const updateRes = await w.call('PATCH', `/v1/corp/dangote-fleet/drivers/${driver.id}`, {
      body: {
        driverName: 'Babatunde Bello',
        phone: '+2348011223344',
        vehiclePlate: 'EKY-999-LK',
      },
    });
    expect(updateRes.status).toBe(200);
    const updated = updateRes.body as {
      driverName: string;
      phone: string;
      vehiclePlate: string;
    };
    expect(updated.driverName).toBe('Babatunde Bello');
    expect(updated.phone).toBe('+2348011223344');
    expect(updated.vehiclePlate).toBe('EKY-999-LK');
  });
});
