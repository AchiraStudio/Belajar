// Single validated source of client configuration (brief §12: never hard-code the API URL in
// several places). Only non-secret values may live here: they are shipped to every user.

export interface AppConfig {
  /** '' = same origin; otherwise an absolute http(s) URL without a trailing slash. */
  apiBaseUrl: string;
}

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigError';
  }
}

export function parseConfig(
  env: { VITE_API_BASE_URL?: string },
  options: { production: boolean },
): AppConfig {
  const raw = (env.VITE_API_BASE_URL ?? '').trim();
  if (raw === '') return { apiBaseUrl: '' };

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new ConfigError(`VITE_API_BASE_URL is not a valid URL: ${JSON.stringify(raw)}`);
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new ConfigError(`VITE_API_BASE_URL must be http(s), got ${url.protocol}`);
  }
  if (url.username || url.password) {
    throw new ConfigError('VITE_API_BASE_URL must not contain credentials');
  }
  if (options.production && url.protocol === 'http:' && !LOCAL_HOSTS.has(url.hostname)) {
    throw new ConfigError('Production builds must use https for a non-local API host');
  }
  return { apiBaseUrl: url.origin + url.pathname.replace(/\/+$/, '') };
}

export const config: AppConfig = parseConfig(import.meta.env, {
  production: import.meta.env.PROD,
});
