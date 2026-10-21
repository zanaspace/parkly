import { OperatorTypeSchema, type OperatorType } from '@parkly/contracts';
import type { ApiProblem } from '../api';

export const BUSINESS_FIELDS = [
  'legalName',
  'tradingName',
  'type',
  'cacNumber',
  'tin',
  'addressLine',
  'contactEmail',
  'contactPhone',
] as const;
export type BusinessField = (typeof BUSINESS_FIELDS)[number];
export type BusinessValues = Partial<Record<BusinessField, string>>;
export type FieldErrors = Partial<Record<BusinessField, string>>;

const TYPE_LABELS: Record<OperatorType, string> = {
  HOTEL: 'Hotel',
  OFFICE: 'Office building',
  COMMERCIAL_LOT: 'Commercial car park',
  EVENT_CENTRE: 'Event centre',
  OTHER: 'Other',
};

export const OPERATOR_TYPE_OPTIONS = OperatorTypeSchema.options.map((value) => ({
  value,
  label: TYPE_LABELS[value],
}));

/** Copy shown under a field when the API rejects it (doc 04 voice: say how to fix it). */
const FIELD_MESSAGES: Record<BusinessField, string> = {
  legalName: 'Enter the registered business name (at least 2 characters).',
  tradingName: 'Enter the name drivers will see (at least 2 characters).',
  type: 'Choose a business type.',
  cacNumber: 'Use the CAC number format, e.g. RC 123456',
  tin: 'Use the TIN format, e.g. 12345678-0001',
  addressLine: 'Enter the business address.',
  contactEmail: 'Enter a valid email address.',
  contactPhone: 'Enter a Nigerian mobile number, e.g. 0803 123 4567.',
};

/** The business-detail fields from a form, trimmed; an empty optional TIN is left out. */
export function readBusinessForm(form: FormData): BusinessValues {
  const values: BusinessValues = {};
  for (const field of BUSINESS_FIELDS) {
    const v = String(form.get(field) ?? '').trim();
    if (v || field !== 'tin') values[field] = v;
  }
  return values;
}

const isField = (v: string): v is BusinessField =>
  (BUSINESS_FIELDS as readonly string[]).includes(v);

/** Turns an API problem into messages under the fields it is about. */
export function businessFieldErrors(problem: ApiProblem): FieldErrors {
  if (problem.code === 'AUTH_PHONE_INVALID') return { contactPhone: FIELD_MESSAGES.contactPhone };
  const errors: FieldErrors = {};
  for (const e of problem.errors ?? []) {
    const field = e.path.split('.')[0] ?? '';
    if (isField(field) && !errors[field]) errors[field] = FIELD_MESSAGES[field];
  }
  return errors;
}
