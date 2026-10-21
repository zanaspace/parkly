'use server';

import type { Operator } from '@parkly/contracts';
import { redirect } from 'next/navigation';
import { apiFetch, ApiProblem } from '../api';
import { loadSession } from '../auth/session';
import { publicEnv } from '../env';
import {
  businessFieldErrors,
  readBusinessForm,
  type BusinessValues,
  type FieldErrors,
} from './form';

export type BusinessFormState =
  | { error?: string; fieldErrors?: FieldErrors; values?: BusinessValues; saved?: boolean }
  | undefined;

const GENERIC = 'We couldn’t save your business details just now. Please try again in a moment.';

function problemState(err: unknown, values: BusinessValues): BusinessFormState {
  if (!(err instanceof ApiProblem)) return { error: GENERIC, values };
  const fieldErrors = businessFieldErrors(err);
  if (Object.keys(fieldErrors).length > 0)
    return { error: 'Please check the highlighted fields.', fieldErrors, values };
  if (err.code === 'OPERATOR_DUPLICATE')
    return { error: 'This account already has an operator. Sign in again to open it.', values };
  if (err.code === 'INVALID_STATE_TRANSITION')
    return { error: 'Your business details are locked while KYB is being reviewed.', values };
  if (err.code === 'VALIDATION_FAILED' && err.detail?.includes('Operator Agreement'))
    return { error: 'Please accept the current Operator Agreement to continue.', values };
  return { error: GENERIC, values };
}

/** O-03: create the operator; the user becomes its OWNER and then sets up MFA. */
export async function createOperator(
  _prev: BusinessFormState,
  form: FormData,
): Promise<BusinessFormState> {
  const values = readBusinessForm(form);
  if (form.get('acceptAgreement') !== 'on')
    return { error: 'Please accept the Operator Agreement and Privacy Notice.', values };

  const session = await loadSession();
  if (!session.signedIn) redirect('/sign-in');
  try {
    await apiFetch<Operator>(publicEnv().apiUrl, '/v1/operators', session.accessToken, {
      method: 'POST',
      body: { ...values, agreementVersion: String(form.get('agreementVersion') ?? '') },
    });
  } catch (err) {
    return problemState(err, values);
  }
  // Owners must complete MFA (aal2); the protected layout sends them to enrolment.
  redirect('/');
}

export async function updateOperator(
  _prev: BusinessFormState,
  form: FormData,
): Promise<BusinessFormState> {
  const values = readBusinessForm(form);
  const operatorId = String(form.get('operatorId') ?? '');
  const session = await loadSession();
  if (!session.signedIn) redirect('/sign-in');
  try {
    await apiFetch<Operator>(
      publicEnv().apiUrl,
      `/v1/operators/${encodeURIComponent(operatorId)}`,
      session.accessToken,
      { method: 'PATCH', body: values },
    );
  } catch (err) {
    return problemState(err, values);
  }
  return { saved: true, values };
}
