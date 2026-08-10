const DEMO_HOSTS = new Set(['localhost', '127.0.0.1', '::1']);

export const useProductionApi = ({
  hostname = globalThis.location?.hostname || '',
  search = globalThis.location?.search || '',
} = {}) => {
  const params = new URLSearchParams(String(search));
  if (params.get('api') === '1') return true;
  if (params.get('demo') === '1') return false;
  const normalizedHost = String(hostname).toLowerCase();
  if (DEMO_HOSTS.has(normalizedHost) || normalizedHost.endsWith('.github.io')) {
    return false;
  }
  return Boolean(normalizedHost);
};
