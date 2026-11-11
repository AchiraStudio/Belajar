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
        if (url.endsWith('/api/session')) return json({ authenticated: authed });
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
});
