import jwt from 'jsonwebtoken';

export function signSession(session, config) {
  return jwt.sign({}, config.secret, {
    algorithm: 'HS256', subject: session.userId, jwtid: session.id,
    expiresIn: config.ttlSeconds, issuer: config.issuer, audience: config.audience,
  });
}

export function verifySessionToken(token, config) {
  if (typeof token !== 'string' || token.length > 2048) return null;
  try {
    const claims = jwt.verify(token, config.secret, {
      algorithms: ['HS256'], issuer: config.issuer, audience: config.audience,
    });
    return typeof claims.sub === 'string' && typeof claims.jti === 'string' && Number.isInteger(claims.exp) ? claims : null;
  } catch { return null; }
}
