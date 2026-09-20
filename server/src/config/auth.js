import './env.js';

export function parseAuthConfig(source = process.env) {
  if (!/^[a-f\d]{64,}$/i.test(source.JWT_SECRET ?? '')) {
    throw new Error('JWT_SECRET must contain at least 64 hexadecimal characters. Run npm run auth:secret.');
  }
  const ttl = source.JWT_TTL_SECONDS ?? '3600';
  if (!/^\d+$/.test(ttl) || Number(ttl) < 300 || Number(ttl) > 86400) {
    throw new Error('JWT_TTL_SECONDS must be an integer between 300 and 86400.');
  }
  const secure = source.NODE_ENV === 'production';
  return {
    secret: source.JWT_SECRET,
    ttlSeconds: Number(ttl),
    issuer: 'railconnect-api',
    audience: 'railconnect-web',
    cookieName: secure ? '__Secure-railconnect_session' : 'railconnect_session',
    cookieOptions: { httpOnly: true, secure, sameSite: 'lax', path: '/api' },
  };
}
