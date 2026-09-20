import { registerPassenger, loginUser } from '../services/auth.service.js';
import { signSession, verifySessionToken } from '../security/tokens.js';

export function createAuthController(getDatabase, config) {
  const sendSession = (response, result, statusCode, message) => {
    response.cookie(config.cookieName, signSession(result.session, config), {
      ...config.cookieOptions, maxAge: config.ttlSeconds * 1000,
    });
    return response.status(statusCode).json({ success: true, message, data: { user: result.user } });
  };
  return {
    register: async (request, response) => sendSession(response, await registerPassenger(getDatabase(), request.validated, config), 201, 'Your passenger account has been created.'),
    login: async (request, response) => sendSession(response, await loginUser(getDatabase(), request.validated, config), 200, 'Signed in successfully.'),
    me: (request, response) => response.json({ success: true, message: 'Current user.', data: { user: request.user } }),
    logout: async (request, response) => {
      const claims = verifySessionToken(request.cookies?.[config.cookieName], config);
      if (claims) await getDatabase().$transaction(async tx => {
        const deleted = await tx.authSession.deleteMany({ where: { id: claims.jti, userId: claims.sub } });
        if (deleted.count) await tx.auditLog.create({ data: { userId: claims.sub, action: 'AUTH_LOGOUT', entityType: 'User', entityId: claims.sub } });
      });
      response.clearCookie(config.cookieName, config.cookieOptions);
      return response.json({ success: true, message: 'Signed out successfully.' });
    },
  };
}
