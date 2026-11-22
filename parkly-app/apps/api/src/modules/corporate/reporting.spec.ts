import { describe, expect, it } from 'vitest';
import { world } from '../../test-helpers.js';

describe('Corporate Bookings & Finance Reporting API (Sprint CORP-05)', () => {
  it('returns 404 for unknown tenant reporting endpoints', async () => {
    const w = world();
    const resBookings = await w.call('GET', '/v1/corp/unknown-org/bookings');
    expect(resBookings.status).toBe(404);

    const resFinance = await w.call('GET', '/v1/corp/unknown-org/finance');
    expect(resFinance.status).toBe(404);
  });

  it('lists corporate bookings and calculates finance summary with 7.5% VAT', async () => {
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

    const driverUserId = '018f0000-0000-7000-8000-000000000099';
    await w.store.users.ensure(driverUserId, { phoneLast4: '2233' });

    const period = new Date().toISOString().slice(0, 7);

    // Record two corporate bookings
    await w.store.corporate.recordBooking({
      corporateId: account.id,
      bookingId: '018f0000-0000-7000-8000-000000000001',
      driverUserId,
      workEmail: 'babajide@zenithbank.com',
      companyName: 'Zenith Bank PLC',
      amountKobo: 40000,
      serviceFeeKobo: 10000,
      vatKobo: 3000,
      billingPeriod: period,
    });

    await w.store.corporate.recordBooking({
      corporateId: account.id,
      bookingId: '018f0000-0000-7000-8000-000000000002',
      driverUserId,
      workEmail: 'babajide@zenithbank.com',
      companyName: 'Zenith Bank PLC',
      amountKobo: 60000,
      serviceFeeKobo: 10000,
      vatKobo: 4500,
      billingPeriod: period,
    });

    // 1. List bookings
    const resBookings = await w.call('GET', '/v1/corp/zenith/bookings');
    expect(resBookings.status).toBe(200);
    const bookingsBody = resBookings.body as {
      bookings: Array<{
        amountKobo: number;
        vatKobo: number;
        workEmail: string;
        billingPeriod: string;
      }>;
      total: number;
    };
    expect(bookingsBody.total).toBe(2);
    expect(bookingsBody.bookings.length).toBe(2);
    expect(bookingsBody.bookings[0]?.workEmail).toBe('babajide@zenithbank.com');

    // 2. Finance summary
    const resFinance = await w.call('GET', `/v1/corp/zenith/finance?period=${period}`);
    expect(resFinance.status).toBe(200);
    const financeBody = resFinance.body as {
      billingPeriod: string;
      totalSpendKobo: number;
      subtotalKobo: number;
      vatKobo: number;
      totalBookings: number;
      activeDrivers: number;
    };

    expect(financeBody.billingPeriod).toBe(period);
    expect(financeBody.subtotalKobo).toBe(100000);
    expect(financeBody.vatKobo).toBe(7500); // 3000 + 4500
    expect(financeBody.totalSpendKobo).toBe(107500); // subtotal + vat
    expect(financeBody.totalBookings).toBe(2);
    expect(financeBody.activeDrivers).toBe(1);
  });
});
