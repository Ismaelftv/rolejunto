// Login com Google e Apple: o app recebe um "ID token" (JWT) do provedor e a API confere a assinatura.
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { config } from '../config.js';

export type OAuthProvider = 'google' | 'apple';
export interface OAuthIdentity { subject: string; email: string | null; emailVerified: boolean; name: string | null }
export interface OAuthVerifier { verify(provider: OAuthProvider, idToken: string): Promise<OAuthIdentity> }

const GOOGLE_JWKS = createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'));
const APPLE_JWKS = createRemoteJWKSet(new URL('https://appleid.apple.com/auth/keys'));

export const jwtOAuthVerifier: OAuthVerifier = {
  async verify(provider, idToken) {
    if (provider === 'google') {
      if (!config.GOOGLE_CLIENT_ID) throw new Error('not_configured');
      const { payload } = await jwtVerify(idToken, GOOGLE_JWKS, { issuer: ['https://accounts.google.com', 'accounts.google.com'], audience: config.GOOGLE_CLIENT_ID.split(',').map((x) => x.trim()) });
      return { subject: String(payload.sub), email: (payload.email as string) ?? null, emailVerified: payload.email_verified === true, name: (payload.name as string) ?? null };
    }
    if (!config.APPLE_CLIENT_ID) throw new Error('not_configured');
    const { payload } = await jwtVerify(idToken, APPLE_JWKS, { issuer: 'https://appleid.apple.com', audience: config.APPLE_CLIENT_ID.split(',').map((x) => x.trim()) });
    const ev = payload.email_verified;
    return { subject: String(payload.sub), email: (payload.email as string) ?? null, emailVerified: ev === true || ev === 'true', name: null };
  },
};
