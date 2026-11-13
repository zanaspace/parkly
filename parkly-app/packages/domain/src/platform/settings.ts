/**
 * Platform settings and feature flags (doc 02 §8, FR-ADM-005): which values a
 * super admin may change, their limits, and how a new value is checked. Only
 * settings the API reads today are listed, so changing one always has an effect;
 * add a row here when something new starts reading a setting.
 */
import {
  DEFAULT_REFUND_APPROVAL_THRESHOLD_KOBO,
  DEFAULT_SUPPORT_REFUND_LIMIT_KOBO,
} from '../booking/index.js';

export type SettingDef = {
  key: string;
  label: string;
  description: string;
  kind: 'int' | 'boolean';
  /** Shown beside the value, e.g. "minutes". */
  unit: string | null;
  min: number | null;
  max: number | null;
  /** What the API uses while no value is saved. */
  default: number | boolean;
};

export const SETTINGS: readonly SettingDef[] = [
  {
    key: 'fees.commission_bps_default',
    label: 'Default commission',
    description:
      'Commission on new operators who have no rate of their own, in basis points (1200 = 12%).',
    kind: 'int',
    unit: 'basis points',
    min: 1000,
    max: 1500,
    default: 1200,
  },
  {
    key: 'fees.overstay_max_multiplier',
    label: 'Overstay price ceiling',
    description:
      'An operator’s overstay price per 15 minutes can’t be more than this many times a quarter of the hourly price.',
    kind: 'int',
    unit: 'times',
    min: 1,
    max: 5,
    default: 2,
  },
  {
    key: 'fees.vat_enabled',
    label: 'Show VAT on receipts',
    description: 'Receipts state the VAT included in the price.',
    kind: 'boolean',
    unit: null,
    min: null,
    max: null,
    default: false,
  },
  {
    key: 'fees.vat_rate_bps',
    label: 'VAT rate',
    description: 'In basis points (750 = 7.5%).',
    kind: 'int',
    unit: 'basis points',
    min: 0,
    max: 3000,
    default: 750,
  },
  {
    key: 'booking.hold_minutes',
    label: 'Unpaid booking hold',
    description: 'How long an unpaid booking holds the space before it is released.',
    kind: 'int',
    unit: 'minutes',
    min: 1,
    max: 60,
    default: 10,
  },
  {
    key: 'booking.early_arrival_min',
    label: 'Early arrival window',
    description: 'How early before the start time a driver can check in.',
    kind: 'int',
    unit: 'minutes',
    min: 0,
    max: 240,
    default: 30,
  },
  {
    key: 'booking.free_cancel_before_start_min',
    label: 'Free cancellation until',
    description: 'A driver who cancels at least this long before the start is refunded in full.',
    kind: 'int',
    unit: 'minutes',
    min: 0,
    max: 1440,
    default: 30,
  },
  {
    key: 'booking.no_show_grace_min',
    label: 'No-show grace',
    description: 'How long after the start a booking waits before it counts as a no-show.',
    kind: 'int',
    unit: 'minutes',
    min: 5,
    max: 240,
    default: 30,
  },
  {
    key: 'session.overstay_grace_min',
    label: 'Overstay grace',
    description: 'Minutes past the end time before overstay is charged.',
    kind: 'int',
    unit: 'minutes',
    min: 0,
    max: 120,
    default: 10,
  },
  {
    key: 'refund.approval_threshold_kobo',
    label: 'Refund second-approver limit',
    description:
      'A staff refund above this waits for a second finance admin. In kobo (5000000 = ₦50,000).',
    kind: 'int',
    unit: 'kobo',
    min: 100_000,
    max: 100_000_000,
    default: DEFAULT_REFUND_APPROVAL_THRESHOLD_KOBO,
  },
  {
    key: 'refund.support_limit_kobo',
    label: 'Support refund limit',
    description:
      'The most support can refund on one booking without finance. In kobo (1000000 = ₦10,000).',
    kind: 'int',
    unit: 'kobo',
    min: 0,
    max: 5_000_000,
    default: DEFAULT_SUPPORT_REFUND_LIMIT_KOBO,
  },
  {
    key: 'pass.max_share_percent',
    label: 'Monthly pass share ceiling',
    description:
      'Maximum percentage of a car park’s bookable capacity that can be allocated to monthly passes.',
    kind: 'int',
    unit: 'percent',
    min: 10,
    max: 100,
    default: 50,
  },
  {
    key: 'pass.requires_verified_driver',
    label: 'Require verified driver for passes',
    description: 'Require Tier 2 driver identity verification before purchasing any monthly pass.',
    kind: 'boolean',
    unit: null,
    min: null,
    max: null,
    default: false,
  },
];

export const findSetting = (key: string): SettingDef | undefined =>
  SETTINGS.find((s) => s.key === key);

export type SettingCheck = { ok: true; value: number | boolean } | { ok: false; reason: string };

/** Accepts a whole number inside the limits, or true/false for an on/off setting. */
export function checkSettingValue(def: SettingDef, input: unknown): SettingCheck {
  if (def.kind === 'boolean')
    return typeof input === 'boolean'
      ? { ok: true, value: input }
      : { ok: false, reason: 'Choose on or off' };
  if (typeof input !== 'number' || !Number.isInteger(input))
    return { ok: false, reason: 'Enter a whole number' };
  if (def.min !== null && input < def.min)
    return { ok: false, reason: `Must be at least ${def.min}` };
  if (def.max !== null && input > def.max)
    return { ok: false, reason: `Must be at most ${def.max}` };
  return { ok: true, value: input };
}

export type FeatureFlagDef = { key: string; label: string; description: string };

/**
 * The flags in doc 02 §8, plus four_eyes_verification (read by lot review today).
 * Features read the others as they ship; until then a flag is stored, not obeyed.
 */
export const FEATURE_FLAGS: readonly FeatureFlagDef[] = [
  {
    key: 'four_eyes_verification',
    label: 'Two people for site visits',
    description:
      'The ops person who recorded a lot visit can’t approve it. Turn on once there are two or more ops staff. This one takes effect now.',
  },
  { key: 'claims_enabled', label: 'Claims', description: 'Damage and theft claims workflow.' },
  { key: 'ratings_enabled', label: 'Ratings', description: 'Drivers rate car parks.' },
  { key: 'passes_enabled', label: 'Monthly passes', description: 'Buy and use monthly passes.' },
  { key: 'events_enabled', label: 'Event booking', description: 'Book for events and venues.' },
  {
    key: 'employer_passes_enabled',
    label: 'Employer passes',
    description: 'Passes paid by employers, with invoicing.',
  },
  { key: 'referrals_enabled', label: 'Referrals', description: 'Referral rewards.' },
  {
    key: 'operator_pro_tier_enabled',
    label: 'Operator paid tier',
    description: 'The paid operator plan.',
  },
  { key: 'saved_cards_enabled', label: 'Saved cards', description: 'Drivers keep a card on file.' },
  {
    key: 'payments_flutterwave_enabled',
    label: 'Flutterwave payments',
    description: 'The second payment provider.',
  },
  {
    key: 'driver_web_booking_enabled',
    label: 'Driver web booking',
    description: 'Book from the website, not only the app.',
  },
];

export const findFlag = (key: string): FeatureFlagDef | undefined =>
  FEATURE_FLAGS.find((f) => f.key === key);
