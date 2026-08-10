import { pathToFileURL } from 'node:url';

const percentile = (values, fraction) => {
  if (!values.length) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * fraction) - 1)];
};

const isProductionHost = (baseUrl) => {
  const host = new URL(baseUrl).hostname.toLowerCase();
  return host === 'pivdoner.ru' || host === 'www.pivdoner.ru';
};

const timedFetch = async (fetcher, url, options) => {
  const startedAt = performance.now();
  const response = await fetcher(url, options);
  return { response, durationMs: performance.now() - startedAt };
};

export const runLoadTest = async ({
  baseUrl,
  fetcher = globalThis.fetch,
  readCount = 100,
  orderCount = 50,
  p95LimitMs = 1000,
  allowProduction = false,
} = {}) => {
  const target = String(baseUrl ?? '').replace(/\/+$/, '');
  if (!target) throw new Error('BASE_URL_REQUIRED');
  if (isProductionHost(target) && !allowProduction) {
    throw new Error('REFUSING_PRODUCTION_LOAD_TEST');
  }

  const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const reads = Array.from({ length: readCount }, () =>
    timedFetch(fetcher, `${target}/home.html`, {
      headers: { Accept: 'text/html' },
    }),
  );
  const orders = Array.from({ length: orderCount }, (_, index) =>
    timedFetch(fetcher, `${target}/api/orders`, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'Idempotency-Key': `load-${runId}-${index}`,
      },
      body: JSON.stringify({
        fulfillment: 'delivery',
        customer: { name: 'Load test', phone: '+7 (999) 000-00-00' },
        address: { street: 'Load test', house: '1' },
        items: [
          { productId: 'nuggets', quantity: 1, sauces: { tasty: 2 } },
        ],
      }),
    }),
  );

  const results = await Promise.all([...reads, ...orders]);
  const orderResults = results.slice(readCount);
  const orderBodies = await Promise.all(
    orderResults.map(async ({ response }) => {
      try {
        return await response.json();
      } catch {
        return {};
      }
    }),
  );
  const durations = results.map(({ durationMs }) => durationMs);
  const serverErrors = results.filter(({ response }) => response.status >= 500).length;
  const failedResponses = results.filter(({ response }) => !response.ok).length;
  const uniqueOrders = new Set(orderBodies.map(({ id }) => id).filter(Boolean)).size;
  const p95Ms = percentile(durations, 0.95);
  const summary = {
    target,
    requests: results.length,
    reads: readCount,
    orders: orderCount,
    uniqueOrders,
    serverErrors,
    failedResponses,
    p95Ms: Math.round(p95Ms * 100) / 100,
    p95LimitMs,
  };

  if (serverErrors || failedResponses || uniqueOrders !== orderCount || p95Ms >= p95LimitMs) {
    const error = new Error('LOAD_TEST_FAILED');
    error.summary = summary;
    throw error;
  }
  return summary;
};

const getOption = (name) => {
  const prefix = `--${name}=`;
  return process.argv.find((value) => value.startsWith(prefix))?.slice(prefix.length);
};

const isMain = process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMain) {
  const baseUrl = getOption('base-url') ?? process.env.LOAD_TEST_BASE_URL;
  runLoadTest({
    baseUrl,
    allowProduction: process.argv.includes('--allow-production'),
  })
    .then((summary) => console.log(JSON.stringify(summary, null, 2)))
    .catch((error) => {
      console.error(JSON.stringify(error.summary ?? { error: error.message }, null, 2));
      process.exitCode = 1;
    });
}
