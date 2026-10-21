import { AMENITIES, VEHICLE_TYPES } from '@parkly/domain/lot';
import { describe, expect, it } from 'vitest';
import {
  AmenitySchema,
  CreateLotRequestSchema,
  SetOpeningHoursRequestSchema,
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
});
