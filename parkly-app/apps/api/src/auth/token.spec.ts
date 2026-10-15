import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT, type JWK } from 'jose';
import { beforeAll, describe, expect, it } from 'vitest';

type PrivateKey = Awaited<ReturnType<typeof generateKeyPair>>['privateKey'];
import { createTokenVerifier, type TokenVerifier } from './token.js';

const SUPABASE_URL = 'https://proj.supabase.co';
const ISSUER = `${SUPABASE_URL}/auth/v1`;

let privateKey: PrivateKey;
let otherKey: PrivateKey;
let verify: TokenVerifier;

beforeAll(async () => {
  const pair = await generateKeyPair('ES256', { extractable: true });
  privateKey = pair.privateKey;
  otherKey = (await generateKeyPair('ES256')).privateKey;
  const jwk: JWK = { ...(await exportJWK(pair.publicKey)), kid: 'k1', alg: 'ES256', use: 'sig' };
  verify = createTokenVerifier({ issuer: ISSUER, jwks: createLocalJWKSet({ keys: [jwk] }) });
});

async function token(
  claims: Record<string, unknown> = {},
  opts: { key?: PrivateKey; alg?: string; kid?: string; exp?: string } = {},
) {
  return new SignJWT({
    aal: 'aal1',
    session_id: '0b8f3a8e-1d4c-4d5e-9f00-000000000001',
    role: 'authenticated',
    ...claims,
  })
    .setProtectedHeader({ alg: opts.alg ?? 'ES256', kid: opts.kid ?? 'k1' })
    .setSubject('6f9619ff-8b86-4011-b42d-00c04fc964ff')
    .setIssuer(ISSUER)
    .setAudience('authenticated')
    .setIssuedAt()
    .setExpirationTime(opts.exp ?? '15m')
    .sign(opts.key ?? privateKey);
}

describe('Supabase JWT verification (doc 05 §4.4)', () => {
  it('accepts a valid ES256 token and returns the identity', async () => {
    const identity = await verify(
      await token({ phone: '2348031234567', aal: 'aal2', amr: [{ method: 'totp' }] }),
    );
    expect(identity).toEqual({
      userId: '6f9619ff-8b86-4011-b42d-00c04fc964ff',
      sessionId: '0b8f3a8e-1d4c-4d5e-9f00-000000000001',
      aal: 'aal2',
      phone: '+2348031234567',
      email: null,
    });
  });

  it('rejects an expired token', async () => {
    await expect(verify(await token({}, { exp: '-1m' }))).rejects.toThrow();
  });

  it('rejects a token signed with another key', async () => {
    await expect(verify(await token({}, { key: otherKey }))).rejects.toThrow();
  });

  it('rejects the wrong audience or issuer', async () => {
    const wrongAud = await new SignJWT({ aal: 'aal1', session_id: 'x' })
      .setProtectedHeader({ alg: 'ES256', kid: 'k1' })
      .setSubject('6f9619ff-8b86-4011-b42d-00c04fc964ff')
      .setIssuer(ISSUER)
      .setAudience('anon')
      .setExpirationTime('5m')
      .sign(privateKey);
    await expect(verify(wrongAud)).rejects.toThrow();

    const wrongIss = await new SignJWT({ aal: 'aal1', session_id: 'x' })
      .setProtectedHeader({ alg: 'ES256', kid: 'k1' })
      .setSubject('6f9619ff-8b86-4011-b42d-00c04fc964ff')
      .setIssuer('https://evil.example/auth/v1')
      .setAudience('authenticated')
      .setExpirationTime('5m')
      .sign(privateKey);
    await expect(verify(wrongIss)).rejects.toThrow();
  });

  it('rejects HS256 tokens (legacy shared secret) even if the kid matches', async () => {
    const hs = await new SignJWT({ aal: 'aal1' })
      .setProtectedHeader({ alg: 'HS256', kid: 'k1' })
      .setSubject('6f9619ff-8b86-4011-b42d-00c04fc964ff')
      .setIssuer(ISSUER)
      .setAudience('authenticated')
      .setExpirationTime('5m')
      .sign(new TextEncoder().encode('legacy-secret-legacy-secret-legacy-secret'));
    await expect(verify(hs)).rejects.toThrow();
  });

  it('rejects an unknown kid', async () => {
    await expect(verify(await token({}, { kid: 'other' }))).rejects.toThrow();
  });

  it('rejects anonymous or malformed sessions', async () => {
    await expect(verify(await token({ is_anonymous: true }))).rejects.toThrow();
    await expect(verify(await token({ session_id: undefined }))).rejects.toThrow();
    await expect(verify('not-a-jwt')).rejects.toThrow();
  });

  it('treats a missing aal as aal1', async () => {
    const identity = await verify(await token({ aal: undefined, email: 'Ops@Parkly.example' }));
    expect(identity.aal).toBe('aal1');
    expect(identity.email).toBe('ops@parkly.example');
  });

  it('accepts dev tokens when allowDevTokens is true', async () => {
    const devVerifier = createTokenVerifier({
      issuer: ISSUER,
      jwks: createLocalJWKSet({ keys: [] }),
      allowDevTokens: true,
    });
    const id1 = await devVerifier('dev-token:+2348031234567:11111111-1111-4111-8111-111111111111');
    expect(id1.userId).toBe('11111111-1111-4111-8111-111111111111');
    expect(id1.phone).toBe('+2348031234567');

    const id2 = await devVerifier('dev-token');
    expect(id2.userId).toBe('11111111-1111-4111-8111-111111111111');
    expect(id2.phone).toBe('+2348031234567');

    // Rejected when allowDevTokens is not set
    await expect(verify('dev-token')).rejects.toThrow();
  });
});
