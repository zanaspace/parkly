import { describe, expect, it } from 'vitest';
import { parseProblem } from '../api';
import { lotFieldErrors, readHoursForm, readLotForm, WEEKDAYS } from './form';

const fd = (entries: [string, string][]) => {
  const f = new FormData();
  for (const [k, v] of entries) f.append(k, v);
  return f;
};

describe('readLotForm', () => {
  it('builds the API body: numbers, coordinates and checkbox lists', () => {
    expect(
      readLotForm(
        fd([
          ['name', ' Eko Hotel Car Park '],
          ['type', 'HOTEL'],
          ['addressLine', 'Adetokunbo Ademola St'],
          ['area', 'Victoria Island'],
          ['lga', ''],
          ['description', ''],
          ['entranceNotes', 'Gate 2'],
          ['lat', '6.4281'],
          ['lng', '3.4219'],
          ['capacityTotal', '300'],
          ['capacityBookable', '120'],
          ['amenities', 'GUARD'],
          ['amenities', 'CCTV'],
          ['vehicleTypes', 'CAR'],
        ]),
      ),
    ).toEqual({
      name: 'Eko Hotel Car Park',
      type: 'HOTEL',
      addressLine: 'Adetokunbo Ademola St',
      area: 'Victoria Island',
      entranceNotes: 'Gate 2',
      location: { lat: 6.4281, lng: 3.4219 },
      capacityTotal: 300,
      capacityBookable: 120,
      amenities: ['GUARD', 'CCTV'],
      vehicleTypes: ['CAR'],
    });
  });

  it('leaves out a location that is not two numbers, so the API asks for it', () => {
    const body = readLotForm(
      fd([
        ['lat', 'six'],
        ['lng', '3.4'],
      ]),
    );
    expect(body).not.toHaveProperty('location');
  });
});

describe('readHoursForm (one row per weekday)', () => {
  it('keeps open and 24-hour days and drops closed ones', () => {
    expect(
      readHoursForm(
        fd([
          ['mode-0', '24h'],
          ['mode-1', 'open'],
          ['opens-1', '07:00'],
          ['closes-1', '22:00'],
          ['mode-2', 'closed'],
          ['opens-2', '07:00'],
          ['mode-5', 'open'],
          ['opens-5', '18:00'],
          ['closes-5', '06:00'],
        ]),
      ),
    ).toEqual([
      { weekday: 0, is24h: true },
      { weekday: 1, is24h: false, opensAt: '07:00', closesAt: '22:00' },
      { weekday: 5, is24h: false, opensAt: '18:00', closesAt: '06:00' },
    ]);
  });

  it('labels the week starting Sunday (weekday 0)', () => {
    expect(WEEKDAYS[0]).toBe('Sunday');
    expect(WEEKDAYS[6]).toBe('Saturday');
  });
});

describe('lotFieldErrors', () => {
  it('uses the API’s message for location and capacity, and friendly copy for format errors', () => {
    const p = parseProblem(400, {
      code: 'VALIDATION_FAILED',
      errors: [
        { path: 'location', message: 'The pin must be in Lagos State.' },
        {
          path: 'capacityBookable',
          message: 'Spaces offered on Parkly can’t be more than the lot’s total.',
        },
        { path: 'name', message: 'Too small: expected string to have >=2 characters' },
        { path: 'vehicleTypes', message: 'Too small' },
      ],
    });
    expect(lotFieldErrors(p)).toEqual({
      location: 'The pin must be in Lagos State.',
      capacityBookable: 'Spaces offered on Parkly can’t be more than the lot’s total.',
      name: 'Enter the lot name (at least 2 characters).',
      vehicleTypes: 'Choose at least one vehicle type.',
    });
  });

  it('maps hours errors to their day', () => {
    const p = parseProblem(400, {
      code: 'VALIDATION_FAILED',
      errors: [{ path: 'days.2', message: 'Opening and closing times can’t be the same.' }],
    });
    expect(lotFieldErrors(p)).toEqual({ 'day-2': 'Opening and closing times can’t be the same.' });
  });
});
