import { createHash, randomBytes } from 'node:crypto';
import argon2 from 'argon2';

export const SESSION_COOKIE = 'pivdoner_session';

const hashToken = (token) =>
  createHash('sha256').update(String(token)).digest('hex');

export const createAuthService = ({
  repository,
  now = () => new Date(),
  sessionDurationMs = 12 * 60 * 60 * 1000,
}) => ({
  login: async (role, pin) => {
    const account = await repository.findActiveAccountByRole(role);
    const valid = account
      ? await argon2.verify(account.pinHash, String(pin ?? ''))
      : false;
    if (!valid) return null;

    const token = randomBytes(32).toString('base64url');
    const expiresAt = new Date(now().getTime() + sessionDurationMs);
    await repository.createSession({
      tokenHash: hashToken(token),
      staffAccountId: account.id,
      expiresAt,
    });
    return { token, expiresAt };
  },

  authenticate: async (token) => {
    if (!token) return null;
    const session = await repository.findSession(hashToken(token));
    if (!session || new Date(session.expiresAt).getTime() <= now().getTime()) {
      return null;
    }
    return {
      id: session.id,
      displayName: session.displayName,
      role: session.role,
    };
  },

  logout: async (token) => {
    if (token) await repository.deleteSession(hashToken(token));
  },
});
