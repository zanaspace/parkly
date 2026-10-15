import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from 'jose';

export type Identity = {
  userId: string;
  sessionId: string;
  aal: 'aal1' | 'aal2';
  /** E.164 with leading "+", from the Supabase token. */
  phone: string | null;
  email: string | null;
};

export type TokenVerifier = (token: string) => Promise<Identity>;

/**
 * Verifies Supabase access tokens against the project JWKS (doc 05 §4.4):
 * ES256 only (legacy HS256 shared-secret tokens are rejected), issuer and
 * audience checked, expiry enforced. Role claims from the hook are ignored
 * here; the API re-reads roles from the database.
 */
export function createTokenVerifier(options: {
  issuer: string;
  jwks: JWTVerifyGetKey;
  allowDevTokens?: boolean;
}): TokenVerifier {
  return async (token) => {
    if (options.allowDevTokens && token.startsWith('dev-token')) {
      let phone = '+2348031234567';
      let userId = '11111111-1111-4111-8111-111111111111';
      if (token.startsWith('dev-token:')) {
        const parts = token.split(':');
        if (parts[1]) phone = parts[1];
        if (parts[2]) userId = parts[2];
      }
      return {
        userId,
        sessionId: `dev-session-${userId.slice(0, 8)}`,
        aal: 'aal1',
        phone,
        email: null,
      };
    }
    const { payload } = await jwtVerify(token, options.jwks, {
      algorithms: ['ES256'],
      issuer: options.issuer,
      audience: 'authenticated',
      requiredClaims: ['sub', 'exp'],
    });
    if (payload.is_anonymous === true) throw new Error('anonymous sessions are not allowed');
    if (typeof payload.session_id !== 'string' || !payload.sub) throw new Error('malformed token');
    const phone =
      typeof payload.phone === 'string' && payload.phone
        ? `+${payload.phone.replace(/^\+/, '')}`
        : null;
    const email =
      typeof payload.email === 'string' && payload.email ? payload.email.toLowerCase() : null;
    return {
      userId: payload.sub,
      sessionId: payload.session_id,
      aal: payload.aal === 'aal2' ? 'aal2' : 'aal1',
      phone,
      email,
    };
  };
}

/** Production: JWKS fetched from Supabase and cached; refreshed on an unknown kid. */
export function supabaseTokenVerifier(
  supabaseUrl: string,
  options?: { allowDevTokens?: boolean },
): TokenVerifier {
  const base = supabaseUrl.replace(/\/$/, '');
  return createTokenVerifier({
    issuer: `${base}/auth/v1`,
    jwks: createRemoteJWKSet(new URL(`${base}/auth/v1/.well-known/jwks.json`), {
      cacheMaxAge: 10 * 60_000,
      cooldownDuration: 30_000,
    }),
    allowDevTokens: options?.allowDevTokens,
  });
}
