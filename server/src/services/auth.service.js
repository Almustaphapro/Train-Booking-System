import bcrypt from 'bcrypt';
import { randomBytes } from 'node:crypto';
import { ApiError } from '../utils/ApiError.js';

export const publicUserSelect = {
  id: true, fullName: true, email: true, phone: true, role: true, status: true, isDemo: true, createdAt: true,
};
const dummyHash = bcrypt.hash(randomBytes(32).toString('hex'), 12);
const invalidCredentials = () => new ApiError(401, 'Invalid email or password.');

async function newSession(tx, userId, ttlSeconds) {
  await tx.authSession.deleteMany({ where: { userId, expiresAt: { lte: new Date() } } });
  return tx.authSession.create({ data: { userId, expiresAt: new Date(Date.now() + ttlSeconds * 1000) } });
}

export async function registerPassenger(db, input, config) {
  const { fullName, email, phone, password } = input;
  const duplicate = () => new ApiError(409, 'An account with that email or phone already exists.');
  if (await db.user.findFirst({ where: { OR: [{ email }, { phone }] }, select: { id: true } })) throw duplicate();
  const passwordHash = await bcrypt.hash(password, 12);
  try {
    return await db.$transaction(async tx => {
      const user = await tx.user.create({ data: { fullName, email, phone, passwordHash, role: 'PASSENGER' }, select: publicUserSelect });
      const session = await newSession(tx, user.id, config.ttlSeconds);
      await tx.auditLog.create({ data: { userId: user.id, action: 'AUTH_REGISTER', entityType: 'User', entityId: user.id } });
      return { user, session };
    });
  } catch (error) {
    if (error.code === 'P2002') throw duplicate();
    throw error;
  }
}

export async function loginUser(db, input, config) {
  const found = await db.user.findUnique({ where: { email: input.email }, select: { ...publicUserSelect, passwordHash: true } });
  const matches = await bcrypt.compare(input.password, found?.passwordHash ?? await dummyHash);
  if (!found || !matches || found.status !== 'ACTIVE') throw invalidCredentials();
  return db.$transaction(async tx => {
    // Recheck mutable account state after the password comparison.
    const user = await tx.user.findUnique({ where: { id: found.id }, select: publicUserSelect });
    if (!user || user.status !== 'ACTIVE') throw invalidCredentials();
    const session = await newSession(tx, user.id, config.ttlSeconds);
    await tx.auditLog.create({ data: { userId: user.id, action: 'AUTH_LOGIN', entityType: 'User', entityId: user.id } });
    return { user, session };
  });
}
