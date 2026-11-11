import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError, apiFetch, apiUrl, setTokenProvider } from './client';

function mockFetch(impl: (url: string, init: RequestInit) => Response | Promise<Response>) {
  const fn = vi.fn((url: string, init: RequestInit) => Promise.resolve(impl(url, init)));
  vi.stubGlobal('fetch', fn);
  return fn;
}

afterEach(() => {
  vi.unstubAllGlobals();
  setTokenProvider(null);
});

describe('apiUrl', () => {
  it('prefixes /api/v1 and honours a base URL', () => {
    expect(apiUrl('/health', '')).toBe('/api/v1/health');
    expect(apiUrl('/health', 'https://api.example.com')).toBe(
      'https://api.example.com/api/v1/health',
    );
  });
  it('rejects paths without a leading slash', () => {
    expect(() => apiUrl('health', '')).toThrow();
  });
});

describe('apiFetch', () => {
  it('returns parsed JSON on success and sends no auth header by default', async () => {
    const fetchMock = mockFetch(() => Response.json({ status: 'ok' }));
    await expect(apiFetch<{ status: string }>('/health')).resolves.toEqual({ status: 'ok' });
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect((init.headers as Record<string, string>).Authorization).toBeUndefined();
  });

  it('adds the bearer token from the provider', async () => {
    const fetchMock = mockFetch(() => Response.json({}));
    setTokenProvider(() => 'abc');
    await apiFetch('/health');
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer abc');
  });

  it('maps the server error model to ApiError', async () => {
    mockFetch(() =>
      Response.json(
        { error: { code: 'not_found', message: 'Endpoint tidak ditemukan.', retryable: false } },
        { status: 404 },
      ),
    );
    const error = await apiFetch('/nope').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ code: 'not_found', status: 404, retryable: false });
    expect((error as ApiError).message).toBe('Endpoint tidak ditemukan.');
  });

  it('copes with non-JSON error bodies and treats 5xx as retryable', async () => {
    mockFetch(() => new Response('<html>Bad gateway</html>', { status: 502 }));
    await expect(apiFetch('/x')).rejects.toMatchObject({
      code: 'http_error',
      status: 502,
      retryable: true,
    });
  });

  it('reports network failure with the legacy wording', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(new TypeError('Failed to fetch'))),
    );
    await expect(apiFetch('/x')).rejects.toMatchObject({
      code: 'network',
      status: 0,
      retryable: true,
      message: 'Tidak dapat terhubung ke server. Periksa koneksi internet.',
    });
  });

  it('supports FormData bodies without setting application/json header', async () => {
    const fetchMock = mockFetch(() => Response.json({ ok: true }));
    const formData = new FormData();
    formData.append('title', 'Test Document');

    await apiFetch('/api/upload', { method: 'POST', body: formData });
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect((init.headers as Record<string, string>)['Content-Type']).toBeUndefined();
    expect(init.body).toBe(formData);
  });
});
