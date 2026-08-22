import { z } from 'zod';

const configSchema = z.object({
  PORT: z.coerce.number().int().min(1).max(65535).default(3001),
  DATABASE_URL: z.string().default(''),
  SESSION_SECRET: z.string().default(''),
  ORDER_ACCESS_SECRET: z.string().default(''),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PAYMENT_PROVIDER: z.enum(['mock', 'yookassa']).default('mock'),
  PUBLIC_BASE_URL: z.string().url().default('http://127.0.0.1:4173'),
  YOOKASSA_SHOP_ID: z.string().default(''),
  YOOKASSA_SECRET_KEY: z.string().default(''),
  VAPID_PUBLIC_KEY: z.string().default(''),
  VAPID_PRIVATE_KEY: z.string().default(''),
  VAPID_SUBJECT: z.string().default(''),
  PUSH_POLL_MS: z.coerce.number().int().min(500).max(60_000).default(2_000),
}).superRefine((config, context) => {
  if (
    config.NODE_ENV === 'production' &&
    config.ORDER_ACCESS_SECRET.length < 32
  ) {
    context.addIssue({
      code: 'custom',
      path: ['ORDER_ACCESS_SECRET'],
      message: 'ORDER_ACCESS_SECRET must be at least 32 characters in production',
    });
  }

  if (
    config.NODE_ENV === 'production' &&
    config.ORDER_ACCESS_SECRET.length >= 32 &&
    config.ORDER_ACCESS_SECRET === config.SESSION_SECRET
  ) {
    context.addIssue({
      code: 'custom',
      path: ['ORDER_ACCESS_SECRET'],
      message: 'ORDER_ACCESS_SECRET must differ from SESSION_SECRET in production',
    });
  }

  const vapidValues = [
    config.VAPID_PUBLIC_KEY,
    config.VAPID_PRIVATE_KEY,
    config.VAPID_SUBJECT,
  ];
  const configuredVapidValues = vapidValues.filter(Boolean).length;
  if (configuredVapidValues !== 0 && configuredVapidValues !== vapidValues.length) {
    context.addIssue({
      code: 'custom',
      path: ['VAPID_PUBLIC_KEY'],
      message: 'VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY and VAPID_SUBJECT must be configured together',
    });
  }
  if (
    config.VAPID_SUBJECT &&
    !config.VAPID_SUBJECT.startsWith('mailto:') &&
    !config.VAPID_SUBJECT.startsWith('https://')
  ) {
    context.addIssue({
      code: 'custom',
      path: ['VAPID_SUBJECT'],
      message: 'VAPID_SUBJECT must use mailto: or https:',
    });
  }
});

export const loadConfig = (env = process.env) => {
  const parsed = configSchema.parse(env);

  return Object.freeze({
    port: parsed.PORT,
    databaseUrl: parsed.DATABASE_URL,
    sessionSecret: parsed.SESSION_SECRET,
    orderAccessSecret: parsed.ORDER_ACCESS_SECRET,
    nodeEnv: parsed.NODE_ENV,
    paymentProvider: parsed.PAYMENT_PROVIDER,
    publicBaseUrl: parsed.PUBLIC_BASE_URL,
    yookassaShopId: parsed.YOOKASSA_SHOP_ID,
    yookassaSecretKey: parsed.YOOKASSA_SECRET_KEY,
    push: Object.freeze({
      enabled: Boolean(parsed.VAPID_PUBLIC_KEY),
      publicKey: parsed.VAPID_PUBLIC_KEY,
      privateKey: parsed.VAPID_PRIVATE_KEY,
      subject: parsed.VAPID_SUBJECT,
      pollMs: parsed.PUSH_POLL_MS,
    }),
  });
};
