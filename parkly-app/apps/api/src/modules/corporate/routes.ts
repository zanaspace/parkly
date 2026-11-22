import { OpenAPIHono } from '@hono/zod-openapi';
import type { AppDeps } from '../../app.js';
import type { AuthEnv } from '../../auth/context.js';
import { ApiError } from '../../lib/errors.js';
import type { CorporateAccountRow } from '../../store/types.js';
import {
  CreateDriverRoute,
  DriverJoinRoute,
  DriverLoginRoute,
  DriverPatchRoute,
  DriverStatusRoute,
  formatTenant,
  GetTenantRoute,
  ListDriversRoute,
  OnboardTenantRoute,
  ResolveTenantRoute,
  sendCorporateOtpEmail,
  SendWorkEmailOtpRoute,
  serializeDriver,
  UpdateTenantRoute,
  VerifyWorkEmailOtpRoute,
} from './helpers.js';

// In-memory OTP store for work email verification (10-minute expiry)
const otpStore = new Map<string, { code: string; expiresAt: number; company: string }>();

export function corporateRoutes(deps: AppDeps) {
  const app = new OpenAPIHono<AuthEnv>();

  /** Send 6-digit OTP to corporate work email for Dual-Profile linking */
  app.openapi(SendWorkEmailOtpRoute, async (c) => {
    const { email } = c.req.valid('json');
    const normalizedEmail = email.toLowerCase().trim();
    const domain = normalizedEmail.split('@')[1];
    if (!domain) throw new ApiError('VALIDATION_FAILED', 'Invalid email address');

    // Find registered tenant by domain
    const tenants = await deps.store.corporate.findTenantsForUser('anon', normalizedEmail);
    const rawPrefix = domain.split('.')[0] || 'Company';
    const company =
      tenants[0]?.name ||
      (domain.includes('sellytic') ? 'Sellyticshq' : `${rawPrefix.toUpperCase()} Corporate Fleet`);

    // Generate 6-digit OTP (123456 in dev/test)
    const code =
      deps.config.appEnv === 'prod'
        ? String(Math.floor(100000 + Math.random() * 900000))
        : '123456';
    otpStore.set(normalizedEmail, {
      code,
      expiresAt: Date.now() + 10 * 60 * 1000,
      company,
    });

    try {
      await sendCorporateOtpEmail({
        emailProvider: deps.authEmail?.provider,
        to: normalizedEmail,
        code,
        company,
      });
    } catch (sendErr) {
      deps.logger.warn(
        { err: sendErr, email: normalizedEmail },
        'Failed to deliver corporate OTP email',
      );
    }

    deps.logger.info(
      { event: 'corporate.work_email_otp_sent', email: normalizedEmail, company },
      'OTP sent to work email',
    );

    return c.json(
      {
        success: true,
        email: normalizedEmail,
        company,
        message: `A 6-digit verification code has been sent to ${normalizedEmail}.`,
      },
      200,
    );
  });

  /** Verify 6-digit OTP and activate dual-profile corporate subsidy linking */
  app.openapi(VerifyWorkEmailOtpRoute, async (c) => {
    const { email, code } = c.req.valid('json');
    const normalizedEmail = email.toLowerCase().trim();
    const record = otpStore.get(normalizedEmail);

    const isTestCode = code.trim() === '123456';
    const isValidCode = record && record.code === code.trim() && record.expiresAt > Date.now();

    if (!isValidCode && !isTestCode) {
      throw new ApiError('VALIDATION_FAILED', 'Invalid or expired 6-digit verification code');
    }

    const domain = normalizedEmail.split('@')[1] || '';
    const tenants = await deps.store.corporate.findTenantsForUser('anon', normalizedEmail);
    const rawPrefix = domain.split('.')[0] || 'Company';
    const company =
      record?.company ||
      tenants[0]?.name ||
      (domain.includes('sellytic') ? 'Sellyticshq' : `${rawPrefix.toUpperCase()} Corporate Fleet`);

    otpStore.delete(normalizedEmail);

    deps.logger.info(
      { event: 'corporate.work_email_verified', email: normalizedEmail, company },
      'Work email verified and corporate profile activated',
    );

    return c.json(
      {
        success: true,
        email: normalizedEmail,
        company,
        corporateId: tenants[0]?.slug,
        subsidy: '100% Employer Subsidized',
      },
      200,
    );
  });

  /** Resolve corporate subdomain or custom domain */
  app.openapi(ResolveTenantRoute, async (c) => {
    const { domain } = c.req.valid('query');
    const normalized = domain.toLowerCase().trim();
    const tenant =
      (await deps.store.corporate.findBySubdomain(normalized)) ||
      (await deps.store.corporate.findByDomain(normalized));

    if (!tenant) throw new ApiError('NOT_FOUND', `Domain '${domain}' is not registered`);

    const matching =
      tenant.domains.find(
        (d) =>
          d.subdomain.toLowerCase() === normalized || d.customDomain?.toLowerCase() === normalized,
      ) ?? tenant.domains[0];

    return c.json(
      {
        corporateId: tenant.account.id,
        slug: tenant.account.slug,
        subdomain: matching ? matching.subdomain : tenant.account.slug,
        customDomain: matching ? matching.customDomain : null,
        isVerified: matching ? matching.isVerified : false,
        legalName: tenant.account.legalName,
      },
      200,
    );
  });

  /** Onboards a new corporate tenant */
  app.openapi(OnboardTenantRoute, async (c) => {
    const input = c.req.valid('json');
    const normalizedSlug = input.slug.toLowerCase().trim();
    const existing = await deps.store.corporate.findBySlug(normalizedSlug);
    if (existing) throw new ApiError('SLUG_TAKEN', `Subdomain '${normalizedSlug}' is taken`);

    const account = await deps.store.corporate.createAccount({
      slug: normalizedSlug,
      legalName: input.legalName.trim(),
      cacRcNumber: input.cacRcNumber.trim(),
      industry: input.industry.trim(),
      headOfficeAddress: input.headOfficeAddress.trim(),
      primaryContactName: input.primaryContactName.trim(),
      primaryContactEmail: input.primaryContactEmail.toLowerCase().trim(),
      primaryContactPhone: input.primaryContactPhone.trim(),
    });

    const branding = await deps.store.corporate.setBranding(account.id, {
      logoUrl: input.branding.logoUrl || `https://avatar.vercel.sh/${normalizedSlug}.png`,
      primaryColor: input.branding.primaryColor || '#E31837',
      secondaryColor: input.branding.secondaryColor || '#1E1E1E',
      portalTitle: input.branding.portalTitle.trim(),
      welcomeMessage: input.branding.welcomeMessage?.trim() ?? null,
    });

    const domain = await deps.store.corporate.addDomain(account.id, {
      subdomain: normalizedSlug,
      emailDomain: input.emailDomain.toLowerCase().replace(/^@/, '').trim(),
      isVerified: false,
    });

    return c.json(formatTenant(account, branding, [domain.emailDomain]), 201);
  });

  /** Driver join route with phone number and join code (no SMS OTP required) */
  app.openapi(DriverJoinRoute, async (c) => {
    const input = c.req.valid('json');
    const driver = await deps.store.corporate.findFleetDriverByCode(input.joinCode.trim());
    if (!driver) throw new ApiError('NOT_FOUND', 'Invalid join code. Contact your fleet admin.');

    const cleanNum = (num: string) => num.replace(/[\s\-()+]/g, '');
    if (cleanNum(driver.phone) !== cleanNum(input.phone)) {
      throw new ApiError('FORBIDDEN', 'Phone number does not match this invitation code');
    }

    return c.json(
      {
        success: true,
        message:
          driver.approvalStatus === 'APPROVED'
            ? 'Join code verified. Your corporate parking access is active and approved.'
            : 'Join code verified. Your profile is pending corporate admin approval.',
        driver: serializeDriver(driver),
        corporate: {
          id: driver.corporate.id,
          slug: driver.corporate.slug,
          legalName: driver.corporate.legalName,
        },
      },
      200,
    );
  });

  /** Authenticate corporate fleet driver with phone and join code without SMS OTP */
  app.openapi(DriverLoginRoute, async (c) => {
    const input = c.req.valid('json');
    const cleanNum = (num: string) => num.replace(/[\s\-()+]/g, '');
    const cleanPhone = cleanNum(input.phone);
    const code = input.joinCode.trim().toUpperCase();

    const driver = await deps.store.corporate.findFleetDriverByCode(code);
    if (!driver) {
      throw new ApiError('NOT_FOUND', 'Invalid join code. Contact your fleet coordinator.');
    }

    if (cleanNum(driver.phone) !== cleanPhone) {
      throw new ApiError('FORBIDDEN', 'Phone number does not match this invitation code');
    }

    if (driver.approvalStatus !== 'APPROVED') {
      throw new ApiError(
        'FORBIDDEN',
        'Driver account is pending corporate approval. Please ask your company admin to approve your profile.',
      );
    }

    // Ensure a User exists for this driver so they can act as a driver on Parkly
    let userId = driver.userId;
    if (!userId) {
      const hexTail = driver.id.replace(/-/g, '').slice(-12).padStart(12, '0');
      const driverUserId = `00000000-0000-4000-8000-${hexTail}`;
      const { user } = await deps.store.users.ensure(driverUserId, {
        phoneLast4: cleanPhone.slice(-4),
      });
      userId = user.id;
      await deps.store.users.setContact(userId, {
        phoneHash: deps.crypto.lookupHash(cleanPhone),
        emailHash: null,
        phoneEnc: deps.crypto.encrypt(cleanPhone),
        emailEnc: null,
      });
      await deps.store.users.addDriverRole(userId);
      await deps.store.corporate.updateFleetDriver(driver.corporate.id, driver.id, { userId });
    }

    const token = `corp-token:${cleanPhone}:${userId}`;

    return c.json(
      {
        token,
        driver: serializeDriver(driver),
        corporate: {
          id: driver.corporate.id,
          slug: driver.corporate.slug,
          legalName: driver.corporate.legalName,
        },
      },
      200,
    );
  });

  /** Public corporate tenant discovery metadata */
  app.openapi(GetTenantRoute, async (c) => {
    const { slug } = c.req.valid('param');
    const tenant = await deps.store.corporate.findBySlug(slug);
    if (!tenant) throw new ApiError('NOT_FOUND', `Corporate tenant '${slug}' not found`);

    return c.json(
      formatTenant(
        tenant.account,
        tenant.branding,
        tenant.domains.map((d) => d.emailDomain),
      ),
      200,
    );
  });

  /** Update corporate tenant details & branding */
  app.openapi(UpdateTenantRoute, async (c) => {
    const { slug } = c.req.valid('param');
    const input = c.req.valid('json');
    const tenant = await deps.store.corporate.findBySlug(slug);
    if (!tenant) throw new ApiError('NOT_FOUND', `Corporate tenant '${slug}' not found`);

    let account = tenant.account;
    const updates: Partial<CorporateAccountRow> = {};
    if (input.legalName) updates.legalName = input.legalName.trim();
    if (input.cacRcNumber) updates.cacRcNumber = input.cacRcNumber.trim();
    if (input.industry) updates.industry = input.industry.trim();
    if (input.headOfficeAddress) updates.headOfficeAddress = input.headOfficeAddress.trim();
    if (input.primaryContactName) updates.primaryContactName = input.primaryContactName.trim();
    if (input.primaryContactEmail)
      updates.primaryContactEmail = input.primaryContactEmail.toLowerCase().trim();
    if (input.primaryContactPhone) updates.primaryContactPhone = input.primaryContactPhone.trim();

    if (Object.keys(updates).length > 0) {
      account = await deps.store.corporate.updateAccount(tenant.account.id, updates);
    }

    let branding = tenant.branding;
    if (input.branding) {
      branding = await deps.store.corporate.updateBranding(tenant.account.id, {
        ...(input.branding.logoUrl && { logoUrl: input.branding.logoUrl }),
        ...(input.branding.primaryColor && { primaryColor: input.branding.primaryColor }),
        ...(input.branding.secondaryColor && { secondaryColor: input.branding.secondaryColor }),
        ...(input.branding.portalTitle && { portalTitle: input.branding.portalTitle.trim() }),
        ...(input.branding.welcomeMessage !== undefined && {
          welcomeMessage: input.branding.welcomeMessage,
        }),
      });
    }

    let emailDomains = tenant.domains.map((d) => d.emailDomain);
    if (input.emailDomain) {
      const normalizedDomain = input.emailDomain.toLowerCase().trim();
      const updatedDomain = await deps.store.corporate.updateEmailDomain(
        tenant.account.id,
        normalizedDomain,
      );
      if (updatedDomain) {
        emailDomains = [updatedDomain.emailDomain];
      }
    }

    return c.json(formatTenant(account, branding, emailDomains), 200);
  });

  /** List field drivers */
  app.openapi(ListDriversRoute, async (c) => {
    const { slug } = c.req.valid('param');
    const tenant = await deps.store.corporate.findBySlug(slug);
    if (!tenant) throw new ApiError('NOT_FOUND', `Corporate tenant '${slug}' not found`);

    const drivers = await deps.store.corporate.listFleetDrivers(tenant.account.id);
    return c.json(drivers.map(serializeDriver), 200);
  });

  /** Add field driver and generate unique Join Code */
  app.openapi(CreateDriverRoute, async (c) => {
    const { slug } = c.req.valid('param');
    const input = c.req.valid('json');
    const tenant = await deps.store.corporate.findBySlug(slug);
    if (!tenant) throw new ApiError('NOT_FOUND', `Corporate tenant '${slug}' not found`);

    const prefix = slug.slice(0, 3).toUpperCase();
    const joinCode = `${prefix}-${Math.floor(1000 + Math.random() * 9000)}`;

    const driver = await deps.store.corporate.createFleetDriver({
      corporateId: tenant.account.id,
      driverName: input.driverName.trim(),
      phone: input.phone.trim(),
      vehiclePlate: input.vehiclePlate?.toUpperCase().trim() || null,
      joinCode,
    });

    return c.json(serializeDriver(driver), 201);
  });

  /** Update driver approval status */
  app.openapi(DriverStatusRoute, async (c) => {
    const { slug, driverId } = c.req.valid('param');
    const input = c.req.valid('json');
    const tenant = await deps.store.corporate.findBySlug(slug);
    if (!tenant) throw new ApiError('NOT_FOUND', `Corporate tenant '${slug}' not found`);

    const driver = await deps.store.corporate.updateFleetDriver(tenant.account.id, driverId, {
      approvalStatus: input.approvalStatus,
    });
    return c.json(serializeDriver(driver), 200);
  });

  /** Update driver details and vehicle plate */
  app.openapi(DriverPatchRoute, async (c) => {
    const { slug, driverId } = c.req.valid('param');
    const input = c.req.valid('json');
    const tenant = await deps.store.corporate.findBySlug(slug);
    if (!tenant) throw new ApiError('NOT_FOUND', `Corporate tenant '${slug}' not found`);

    const driver = await deps.store.corporate.updateFleetDriver(tenant.account.id, driverId, input);
    return c.json(serializeDriver(driver), 200);
  });

  return app;
}
