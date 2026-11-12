import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { UNAUTHORIZED_EVENT } from '../../services/api/client';
import { AuthGate } from './AuthGate';

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

describe('AuthGate', () => {
  let authed = false;
  let loginBody: unknown = null;

  beforeEach(() => {
    cleanup();
    authed = false;
    loginBody = null;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.endsWith('/api/v1/health')) return json({ status: 'ok', service: 'stuby', version: '0.1.0' });
        if (url.endsWith('/api/session')) return json({ authenticated: authed });
        if (url.includes('/api/rpc/')) return json({ ok: true, data: {} });
        if (url.endsWith('/api/login')) {
          loginBody = JSON.parse(String(init?.body ?? '{}'));
          if ((loginBody as { password: string }).password === 'benar') {
            authed = true;
            return json({ ok: true });
          }
          return json({ error: 'Password salah' }, 401);
        }
        return json({}, 404);
      }),
    );
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('shows the login screen, rejects a wrong password, then reveals the app', async () => {
    render(
      <AuthGate>
        <div>Isi aplikasi</div>
      </AuthGate>,
    );

    const input = await screen.findByLabelText('Kata sandi');
    expect(screen.queryByText('Isi aplikasi')).toBeNull();

    fireEvent.change(input, { target: { value: 'salah' } });
    fireEvent.click(screen.getByRole('button', { name: 'Masuk' }));
    expect(await screen.findByText('Password salah')).toBeTruthy();

    fireEvent.change(screen.getByLabelText('Kata sandi'), { target: { value: 'benar' } });
    fireEvent.click(screen.getByRole('button', { name: 'Masuk' }));
    expect(await screen.findByText('Isi aplikasi')).toBeTruthy();
    expect(loginBody).toEqual({ password: 'benar' });
  });

  it('goes straight to the app when a session already exists, and back to login on a 401 signal', async () => {
    authed = true;
    render(
      <AuthGate>
        <div>Isi aplikasi</div>
      </AuthGate>,
    );
    expect(await screen.findByText('Isi aplikasi')).toBeTruthy();

    act(() => {
      window.dispatchEvent(new Event(UNAUTHORIZED_EVENT));
    });
    expect(await screen.findByLabelText('Kata sandi')).toBeTruthy();
    expect(screen.queryByText('Isi aplikasi')).toBeNull();
  });

  it('reports an unreachable server instead of showing a blank screen', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new TypeError('Failed to fetch'))));
    render(
      <AuthGate>
        <div>Isi aplikasi</div>
      </AuthGate>,
    );
    expect(await screen.findByText('Server tidak terjangkau')).toBeTruthy();
    expect(screen.getByRole('button', { name: /Coba Lagi/i })).toBeTruthy();
  });

  it('runs the startup sequence for real: health, session, then the first screens data', async () => {
    authed = true;
    const calls: string[] = [];
    const base = globalThis.fetch as unknown as (i: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        calls.push(String(input).replace(/^.*\/api/, '/api'));
        return base(input, init);
      }),
    );
    render(
      <AuthGate>
        <div>Isi aplikasi</div>
      </AuthGate>,
    );
    expect(await screen.findByText('Isi aplikasi')).toBeTruthy();
    expect(calls[0]).toBe('/api/v1/health');
    expect(calls[1]).toBe('/api/session');
    expect(calls.filter((c) => c.startsWith('/api/rpc/')).map((c) => c.replace('/api/rpc/', '')).sort()).toEqual(
      ['dashboard', 'get_settings', 'list_documents', 'list_subjects'],
    );
  });

  it('does not claim to have loaded data it did not load when nobody is signed in', async () => {
    render(
      <AuthGate>
        <div>Isi aplikasi</div>
      </AuthGate>,
    );
    await screen.findByLabelText('Kata sandi');
    expect(screen.queryByText('Data belajarmu siap')).toBeNull();
  });

  it('retries a flaky server before giving up, and Coba Lagi starts the sequence again', async () => {
    let failures = 2;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.endsWith('/api/v1/health')) {
          if (failures > 0) {
            failures -= 1;
            throw new TypeError('Failed to fetch');
          }
          return json({ status: 'ok' });
        }
        if (url.endsWith('/api/session')) return json({ authenticated: true });
        return json({ ok: true, data: {} });
      }),
    );
    render(
      <AuthGate>
        <div>Isi aplikasi</div>
      </AuthGate>,
    );
    // two failures, third attempt succeeds: no error screen
    expect(await screen.findByText('Isi aplikasi')).toBeTruthy();
    expect(screen.queryByText('Server tidak terjangkau')).toBeNull();

    cleanup();
    failures = 99;
    render(
      <AuthGate>
        <div>Isi aplikasi</div>
      </AuthGate>,
    );
    expect(await screen.findByText('Server tidak terjangkau')).toBeTruthy();
    failures = 0;
    fireEvent.click(screen.getByRole('button', { name: /Coba Lagi/i }));
    expect(await screen.findByText('Isi aplikasi')).toBeTruthy();
  });
});
