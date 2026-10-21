import { AMENITIES, VEHICLE_TYPES } from '@parkly/domain/lot';
import { describe, expect, it } from 'vitest';
import {
  AmenitySchema,
  CreateLotRequestSchema,
  SetOpeningHoursRequestSchema,
  SetRatePlanRequestSchema,
  SubmitPermitRequestSchema,
  UpdateLotRequestSchema,
  VehicleTypeSchema,
} from './lots.js';

const lot = {
  name: 'Eko Hotel Car Park',
  type: 'HOTEL',
  addressLine: 'Adetokunbo Ademola St, Victoria Island',
  location: { lat: 6.4281, lng: 3.4219 },
  capacityTotal: 300,
  capacityBookable: 120,
  amenities: ['GUARD', 'CCTV'],
  vehicleTypes: ['CAR', 'SUV'],
};

describe('lot contracts (FR-LOT-002)', () => {
  it('matches the domain amenity and vehicle lists', () => {
    expect(AmenitySchema.options).toEqual([...AMENITIES]);
    expect(VehicleTypeSchema.options).toEqual([...VEHICLE_TYPES]);
  });

  it('accepts a complete new lot', () => {
    expect(CreateLotRequestSchema.safeParse(lot).success).toBe(true);
  });

  it('needs at least one vehicle type and known amenities', () => {
    expect(CreateLotRequestSchema.safeParse({ ...lot, vehicleTypes: [] }).success).toBe(false);
    expect(CreateLotRequestSchema.safeParse({ ...lot, amenities: ['JACUZZI'] }).success).toBe(
      false,
    );
  });

  it('requires the version on updates', () => {
    expect(UpdateLotRequestSchema.safeParse({ name: 'New name' }).success).toBe(false);
    expect(UpdateLotRequestSchema.safeParse({ name: 'New name', version: 3 }).success).toBe(true);
  });

  it('takes opening hours as 24h days or HH:MM windows', () => {
    expect(
      SetOpeningHoursRequestSchema.safeParse({
        days: [
          { weekday: 0, is24h: true },
          { weekday: 1, is24h: false, opensAt: '07:00', closesAt: '22:00' },
        ],
      }).success,
    ).toBe(true);
    expect(
      SetOpeningHoursRequestSchema.safeParse({
        days: [{ weekday: 1, is24h: false, opensAt: '7am', closesAt: '22:00' }],
      }).success,
    ).toBe(false);
  });

  it('takes a permit as number + ISO dates + the uploaded file', () => {
    const ok = {
      permitNumber: 'LASPA/2026/0012',
      issuedAt: '2026-01-10',
      expiresAt: '2027-01-09',
      fileId: '01a15ff2-2e4e-711e-a9b4-c0dea80aabbb',
    };
    expect(SubmitPermitRequestSchema.safeParse(ok).success).toBe(true);
    expect(SubmitPermitRequestSchema.safeParse({ ...ok, expiresAt: '09/01/2027' }).success).toBe(
      false,
    );
  });

  it('takes prices in whole kobo, per product', () => {
    expect(
      SetRatePlanRequestSchema.safeParse({
        product: 'HOURLY',
        hourlyRateKobo: 50_000,
        minMinutes: 60,
      }).success,
    ).toBe(true);
    expect(
      SetRatePlanRequestSchema.safeParse({ product: 'DAILY', dailyRateKobo: 250_000 }).success,
    ).toBe(true);
    expect(
      SetRatePlanRequestSchema.safeParse({
        product: 'HOURLY',
        hourlyRateKobo: 500.5,
        minMinutes: 60,
      }).success,
    ).toBe(false);
    expect(
      SetRatePlanRequestSchema.safeParse({ product: 'MONTHLY', dailyRateKobo: 1 }).success,
    ).toBe(false);
  });
});
