import { verifySessionToken } from '../security/tokens.js';
import { publicUserSelect } from '../services/auth.service.js';
import { ApiError } from '../utils/ApiError.js';

export function authenticate(getDatabase, config) {
  return async (request, _response, next) => {
    const claims = verifySessionToken(request.cookies?.[config.cookieName], config);
    if (!claims) throw new ApiError(401, 'Please sign in to continue.');
    const session = await getDatabase().authSession.findUnique({
      where: { id: claims.jti }, include: { user: { select: publicUserSelect } },
    });
    if (!session || session.userId !== claims.sub || session.expiresAt <= new Date() || session.user.status !== 'ACTIVE') {
      throw new ApiError(401, 'Please sign in to continue.');
    }
    request.user = session.user;
    request.authSessionId = session.id;
    next();
  };
}

export function authorize(...roles) {
  return (request, _response, next) => {
    if (!request.user) return next(new ApiError(401, 'Please sign in to continue.'));
    if (!roles.includes(request.user.role)) return next(new ApiError(403, 'You do not have permission to access this resource.'));
    return next();
  };
}
