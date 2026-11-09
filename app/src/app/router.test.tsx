import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AppRoutes } from './router';

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AppRoutes />
    </MemoryRouter>,
  );
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('AppRoutes', () => {
  it('shows the home page with the connected server badge', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(Response.json({ status: 'ok', service: 'belajar', version: '0.1.0' }))),
    );
    renderAt('/');
    expect(screen.getByRole('heading', { name: 'Belajar' })).toBeTruthy();
    await waitFor(() => expect(screen.getByRole('status').textContent).toContain('Server terhubung'));
    expect(screen.getByRole('status').textContent).toContain('v0.1.0');
  });

  it('shows the legacy not-found copy for unknown routes', () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new TypeError('offline'))));
    renderAt('/tidak-ada');
    expect(screen.getByRole('heading', { name: 'Halaman tidak ditemukan' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Kembali ke beranda' }).getAttribute('href')).toBe('/');
  });

  it('reports an unreachable server instead of crashing', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new TypeError('offline'))));
    renderAt('/');
    await waitFor(() => expect(screen.getByRole('status').textContent).toContain('Server tidak terjangkau'));
  });

  it('has a skip link and a focusable main landmark', () => {
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})));
    renderAt('/');
    expect(screen.getByRole('link', { name: 'Langsung ke isi halaman' }).getAttribute('href')).toBe('#view');
    expect(screen.getByRole('main').getAttribute('tabindex')).toBe('-1');
  });
});
