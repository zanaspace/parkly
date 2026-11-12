/**
 * Doc 05 section 4.6: changing money or rules needs an authenticator-app check from
 * the last 5 minutes. The API answers STEP_UP_REQUIRED; the console shows this text with
 * a link to confirm, and the admin tries again afterwards.
 */
export const STEP_UP_MESSAGE =
  'For safety, confirm with your authenticator app first, then try again.';
