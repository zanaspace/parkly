import {
  AmenitySchema,
  VehicleTypeSchema,
  type Amenity,
  type OpeningDay,
  type VehicleType,
} from '@parkly/contracts';
import type { ApiProblem } from '../api';

export const WEEKDAYS = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
];

export const AMENITY_LABELS: Record<Amenity, string> = {
  GUARD: 'Security guard',
  CCTV: 'CCTV',
  LIGHTING: 'Good lighting',
  COVERED: 'Covered parking',
  EV: 'EV charging',
  ACCESS_CONTROL: 'Access control (barrier/gate)',
  TOILET: 'Toilets',
};

export const VEHICLE_LABELS: Record<VehicleType, string> = {
  CAR: 'Cars',
  SUV: 'SUVs',
  BUS: 'Buses',
};

const TEXT_FIELDS = [
  'name',
  'type',
  'addressLine',
  'area',
  'lga',
  'description',
  'entranceNotes',
] as const;

export type LotBody = Partial<{
  name: string;
  type: string;
  addressLine: string;
  area: string;
  lga: string;
  description: string;
  entranceNotes: string;
  location: { lat: number; lng: number };
  capacityTotal: number;
  capacityBookable: number;
  amenities: Amenity[];
  vehicleTypes: VehicleType[];
}>;

const num = (v: FormDataEntryValue | null) => {
  const s = String(v ?? '').trim();
  return s === '' ? Number.NaN : Number(s);
};

/** Lot details form → API body. Empty optional text is left out; numbers are parsed. */
export function readLotForm(form: FormData): LotBody {
  const body: LotBody = {};
  for (const field of TEXT_FIELDS) {
    const v = String(form.get(field) ?? '').trim();
    if (v) body[field] = v;
  }
  const lat = num(form.get('lat'));
  const lng = num(form.get('lng'));
  if (Number.isFinite(lat) && Number.isFinite(lng)) body.location = { lat, lng };
  const total = num(form.get('capacityTotal'));
  const bookable = num(form.get('capacityBookable'));
  if (Number.isFinite(total)) body.capacityTotal = total;
  if (Number.isFinite(bookable)) body.capacityBookable = bookable;
  body.amenities = form
    .getAll('amenities')
    .map(String)
    .filter((a): a is Amenity => AmenitySchema.safeParse(a).success);
  body.vehicleTypes = form
    .getAll('vehicleTypes')
    .map(String)
    .filter((v): v is VehicleType => VehicleTypeSchema.safeParse(v).success);
  return body;
}

/** The 7-row hours grid → open days only (closed days are left out). */
export function readHoursForm(form: FormData): OpeningDay[] {
  const days: OpeningDay[] = [];
  for (let weekday = 0; weekday < 7; weekday++) {
    const mode = String(form.get(`mode-${weekday}`) ?? 'closed');
    if (mode === '24h') days.push({ weekday, is24h: true });
    else if (mode === 'open')
      days.push({
        weekday,
        is24h: false,
        opensAt: String(form.get(`opens-${weekday}`) ?? ''),
        closesAt: String(form.get(`closes-${weekday}`) ?? ''),
      });
  }
  return days;
}

/** For format errors the API reports in validator wording, say what to enter instead. */
const FRIENDLY: Record<string, string> = {
  name: 'Enter the lot name (at least 2 characters).',
  type: 'Choose the kind of lot.',
  addressLine: 'Enter the street address (at least 5 characters).',
  location: 'Enter the latitude and longitude of the entrance, or use your current location.',
  capacityTotal: 'Enter the total number of spaces.',
  capacityBookable: 'Enter how many spaces Parkly can sell.',
  vehicleTypes: 'Choose at least one vehicle type.',
  amenities: 'Choose from the listed amenities.',
};

/** Paths whose API message is already written for people (domain checks). */
const API_WORDED = new Set(['location', 'capacityTotal', 'capacityBookable']);

export function lotFieldErrors(problem: ApiProblem): Record<string, string> {
  const out: Record<string, string> = {};
  for (const e of problem.errors ?? []) {
    const [head, sub] = e.path.split('.');
    if (head === 'days' && sub !== undefined) {
      out[`day-${sub}`] ??= e.message;
      continue;
    }
    if (!head) continue;
    const message =
      API_WORDED.has(head) && !e.message.startsWith('Too') && !e.message.startsWith('Invalid')
        ? e.message
        : (FRIENDLY[head] ?? e.message);
    out[head] ??= message;
  }
  return out;
}
