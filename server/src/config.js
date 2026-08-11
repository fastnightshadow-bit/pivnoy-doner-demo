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
  });
};
