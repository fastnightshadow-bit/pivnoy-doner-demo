import {
  createHash,
  createHmac,
  timingSafeEqual,
} from 'node:crypto';

const SHA256_HEX_PATTERN = /^[a-f0-9]{64}$/;

export const deriveOrderAccessToken = ({ orderId, idempotencyKey, secret }) =>
  createHmac('sha256', secret)
    .update(`${orderId}\0${idempotencyKey}`)
    .digest('base64url');

export const hashOrderAccessToken = (token) =>
  createHash('sha256').update(token).digest('hex');

export const verifyOrderAccessToken = (token, expectedHash) => {
  if (
    typeof token !== 'string' ||
    typeof expectedHash !== 'string' ||
    !SHA256_HEX_PATTERN.test(expectedHash)
  ) {
    return false;
  }

  const actualHashBuffer = Buffer.from(hashOrderAccessToken(token), 'hex');
  const expectedHashBuffer = Buffer.from(expectedHash, 'hex');
  return timingSafeEqual(actualHashBuffer, expectedHashBuffer);
};
