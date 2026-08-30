import { createHash, randomBytes, randomInt, randomUUID } from 'node:crypto';

export const KIOSK_SESSION_COOKIE = 'pivdoner_kiosk';

export const hashKioskToken = (value) =>
  createHash('sha256').update(String(value)).digest('hex');

export const createKioskAuthService = ({
  repository,
  now = () => new Date(),
  createCode = () => String(randomInt(0, 1_000_000)).padStart(6, '0'),
  createToken = () => randomBytes(32).toString('base64url'),
  createId = randomUUID,
  activationDurationMs = 10 * 60 * 1000,
  sessionDurationMs = 90 * 24 * 60 * 60 * 1000,
}) => ({
  createActivation: async (account) => {
    const code = createCode();
    const expiresAt = new Date(now().getTime() + activationDurationMs);
    await repository.saveActivation({
      codeHash: hashKioskToken(code),
      createdBy: account.id,
      expiresAt: expiresAt.toISOString(),
    });
    return { code, expiresAt: expiresAt.toISOString() };
  },

  activate: async (code, displayName) => {
    const normalizedCode = String(code || '').trim();
    const normalizedName = String(displayName || '').trim();
    if (!/^\d{6}$/.test(normalizedCode) || normalizedName.length < 2) {
      return null;
    }
    const token = createToken();
    const currentTime = now();
    const expiresAt = new Date(currentTime.getTime() + sessionDurationMs);
    const device = await repository.consumeActivation({
      codeHash: hashKioskToken(normalizedCode),
      now: currentTime.toISOString(),
      device: {
        id: createId(),
        displayName: normalizedName,
        tokenHash: hashKioskToken(token),
        expiresAt: expiresAt.toISOString(),
        active: true,
      },
    });
    return device ? { token, expiresAt, device } : null;
  },

  authenticate: async (token) => {
    if (!token) return null;
    const device = await repository.findActiveByTokenHash(
      hashKioskToken(token),
    );
    if (
      !device ||
      device.active === false ||
      new Date(device.expiresAt).getTime() <= now().getTime()
    ) return null;
    await repository.touch?.(device.id, now().toISOString());
    return {
      id: device.id,
      displayName: device.displayName,
    };
  },
});
