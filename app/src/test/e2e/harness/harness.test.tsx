import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { useLocation } from 'react-router';
import {
  mockRpc,
  stubMatchMedia,
  stubTauri,
  unstubTauri,
  createLocalStorageMock,
  stubLocalStorage,
  mount,
  useTestTheme,
  screen,
  fireEvent,
  cleanup,
  defaultDashboardFixture,
  defaultDocumentDetailFixture,
} from './index';

describe('Stuby E2E Test Harness Verification', () => {
  beforeEach(() => {
    mockRpc.install();
    mockRpc.reset();
  });

  afterEach(() => {
    cleanup();
    mockRpc.uninstall();
    unstubTauri();
  });

  // ==========================================================================
  // 1. Mock RPC Interception: Health, RPC Actions & Overrides
  // ==========================================================================
  describe('mockRpc: Global Fetch Interception & Fixtures', () => {
    it('intercepts /api/v1/health and returns default healthy status', async () => {
      const res = await fetch('/api/v1/health');
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data).toEqual({
        status: 'ok',
        service: 'stuby-server',
        version: '0.1.0',
      });

      expect(mockRpc.getLastCall('health')?.action).toBe('health');
    });

    it('intercepts /health (unversioned path) and returns health data', async () => {
      const res = await fetch('/health');
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.status).toBe('ok');
    });

    it('supports custom response override on health endpoint', async () => {
      mockRpc.setResponse('health', {
        status: 'maintenance',
        service: 'stuby-test',
        version: '0.9.9',
      });

      const res = await fetch('/api/v1/health');
      const data = await res.json();

      expect(data.status).toBe('maintenance');
      expect(data.version).toBe('0.9.9');
    });

    it('intercepts /api/rpc/:action and /api/v1/rpc/:action seamlessly', async () => {
      // 1. Unversioned RPC call
      const res1 = await fetch('/api/rpc/dashboard', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ streak_only: false }),
      });
      expect(res1.status).toBe(200);
      const data1 = await res1.json();
      expect(data1.ok).toBe(true);
      expect(data1.data.streak.count).toBe(defaultDashboardFixture.streak.count);

      // 2. Versioned RPC call
      const res2 = await fetch('/api/v1/rpc/get_document', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: 101 }),
      });
      expect(res2.status).toBe(200);
      const data2 = await res2.json();
      expect(data2.ok).toBe(true);
      expect(data2.data.document.title).toBe(defaultDocumentDetailFixture.document.title);
      expect(data2.data.note.content_md).toContain('Teorema Pythagoras');
    });

    it('allows custom response override on RPC actions', async () => {
      mockRpc.setResponse('dashboard', {
        streak: { count: 42, last_activity_date: '2026-11-10', today_done: true },
        weak_count: 0,
      });

      const res = await fetch('/api/rpc/dashboard', { method: 'POST' });
      const body = await res.json();

      expect(body.ok).toBe(true);
      expect(body.data.streak.count).toBe(42);
      expect(body.data.weak_count).toBe(0);
    });

    it('records call history accurately with payload and method', async () => {
      await fetch('/api/rpc/create_subject', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Biologi Sel', color: '#10B981' }),
      });

      const calls = mockRpc.getCalls('create_subject');
      expect(calls.length).toBe(1);
      expect(calls[0]?.method).toBe('POST');
      expect(calls[0]?.payload).toEqual({ name: 'Biologi Sel', color: '#10B981' });
    });

    it('supports artificial delay for testing loading skeletons', async () => {
      mockRpc.setDelay('list_quizzes', 50);

      const start = Date.now();
      await fetch('/api/rpc/list_quizzes', { method: 'POST' });
      const elapsed = Date.now() - start;

      expect(elapsed).toBeGreaterThanOrEqual(40);
    });
  });

  // ==========================================================================
  // 2. Honest Error & Offline State Controls
  // ==========================================================================
  describe('mockRpc: Honest States & ADR-7 Error Simulation', () => {
    it('simulates network offline by rejecting fetch with TypeError', async () => {
      mockRpc.setOffline(true);

      await expect(fetch('/api/v1/health')).rejects.toThrow('Failed to fetch');
      await expect(fetch('/api/rpc/dashboard')).rejects.toThrow('Failed to fetch');

      // Restoring offline resumes normal responses
      mockRpc.setOffline(false);
      const res = await fetch('/api/v1/health');
      expect(res.status).toBe(200);
    });

    it('simulates ADR-7 error structure on RPC failure', async () => {
      mockRpc.setError('generate_quiz', {
        status: 400,
        code: 'no_concepts_found',
        message: 'Tidak ada konsep yang ditemukan untuk membuat kuis.',
        retryable: false,
      });

      const res = await fetch('/api/rpc/generate_quiz', { method: 'POST' });
      expect(res.status).toBe(400);

      const body = await res.json();
      expect(body).toEqual({
        error: {
          code: 'no_concepts_found',
          message: 'Tidak ada konsep yang ditemukan untuk membuat kuis.',
          retryable: false,
        },
      });
    });

    it('simulates 503 Service Unavailable when health is set to down', async () => {
      mockRpc.setHealthDown('Server sedang dalam pemeliharaan terjadwal.');

      const res = await fetch('/api/v1/health');
      expect(res.status).toBe(503);

      const body = await res.json();
      expect(body.error).toEqual({
        code: 'service_unavailable',
        message: 'Server sedang dalam pemeliharaan terjadwal.',
        retryable: true,
      });
    });

    it('clears errors and overrides on reset()', async () => {
      mockRpc.setError('dashboard', { status: 500, message: 'Database crash' });
      mockRpc.setOffline(true);

      mockRpc.reset();

      const res = await fetch('/api/rpc/dashboard', { method: 'POST' });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.ok).toBe(true);
    });
  });

  // ==========================================================================
  // 3. Browser Stubs: matchMedia, __TAURI__, and localStorage
  // ==========================================================================
  describe('browserStubs: matchMedia, Tauri and localStorage', () => {
    it('stubs matchMedia and triggers change listeners reactively', () => {
      const controller = stubMatchMedia(false);

      expect(window.matchMedia('(prefers-color-scheme: dark)').matches).toBe(false);

      const listener = vi.fn();
      const mql = window.matchMedia('(prefers-color-scheme: dark)');
      mql.addEventListener('change', listener);

      controller.setMatches(true);
      expect(window.matchMedia('(prefers-color-scheme: dark)').matches).toBe(true);
      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({ matches: true })
      );

      controller.restore();
    });

    it('stubs window.__TAURI__ and records window control calls', async () => {
      const { mockWindow, unstub } = stubTauri();

      expect((window as any).__TAURI__).toBeDefined();
      const win = (window as any).__TAURI__.window.getCurrentWindow();

      await win.minimize();
      await win.toggleMaximize();
      await win.close();
      await win.startDragging();
      await win.setTheme('dark');

      expect(mockWindow.minimize).toHaveBeenCalledTimes(1);
      expect(mockWindow.toggleMaximize).toHaveBeenCalledTimes(1);
      expect(mockWindow.close).toHaveBeenCalledTimes(1);
      expect(mockWindow.startDragging).toHaveBeenCalledTimes(1);
      expect(mockWindow.setTheme).toHaveBeenCalledWith('dark');

      unstub();
      expect((window as any).__TAURI__).toBeUndefined();
    });

    it('provides clean in-memory localStorage mock', () => {
      const storage = createLocalStorageMock();
      expect(storage.getItem('key')).toBeNull();

      storage.setItem('stuby-theme', 'dark');
      expect(storage.getItem('stuby-theme')).toBe('dark');
      expect(storage.length).toBe(1);

      storage.removeItem('stuby-theme');
      expect(storage.getItem('stuby-theme')).toBeNull();

      storage.setItem('a', '1');
      storage.setItem('b', '2');
      storage.clear();
      expect(storage.length).toBe(0);
    });

    it('stubLocalStorage intercepts global window.localStorage cleanly', () => {
      const { storage, restore } = stubLocalStorage();

      window.localStorage.setItem('token', 'secret-123');
      expect(window.localStorage.getItem('token')).toBe('secret-123');
      expect(storage.getItem('token')).toBe('secret-123');

      restore();
    });
  });

  // ==========================================================================
  // 4. Custom Mount Renderer: Router & Theme Context Integration
  // ==========================================================================
  describe('mount: Opaque-Box Test Renderer', () => {
    function DummyView() {
      const location = useLocation();
      const { theme, resolvedTheme, toggleTheme } = useTestTheme();

      return (
        <div>
          <h1 data-testid="page-title">Halaman Uji</h1>
          <p data-testid="route-path">{location.pathname}</p>
          <span data-testid="current-theme">{theme}</span>
          <span data-testid="resolved-theme">{resolvedTheme}</span>
          <button onClick={toggleTheme}>Ganti Tema</button>
        </div>
      );
    }

    it('mounts component with MemoryRouter and resolves route correctly', () => {
      mount(<DummyView />, { route: '#/materi/101' });

      expect(screen.getByTestId('page-title').textContent).toBe('Halaman Uji');
      expect(screen.getByTestId('route-path').textContent).toBe('/materi/101');
    });

    it('sets data-theme attribute on documentElement and container', () => {
      mount(<DummyView />, { theme: 'dark' });

      expect(screen.getByTestId('current-theme').textContent).toBe('dark');
      expect(screen.getByTestId('resolved-theme').textContent).toBe('dark');
      expect(document.documentElement.getAttribute('data-theme')).toBe('dark');

      const container = screen.getByTestId('mount-theme-root');
      expect(container.getAttribute('data-theme')).toBe('dark');
    });

    it('supports dynamic theme toggle via useTestTheme hook', () => {
      mount(<DummyView />, { theme: 'light' });

      expect(screen.getByTestId('resolved-theme').textContent).toBe('light');
      expect(document.documentElement.getAttribute('data-theme')).toBe('light');

      const button = screen.getByRole('button', { name: /ganti tema/i });
      fireEvent.click(button);

      expect(screen.getByTestId('resolved-theme').textContent).toBe('dark');
      expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    });

    it('stubs Tauri window when isTauri option is true', () => {
      mount(<DummyView />, { isTauri: true });
      expect((window as any).__TAURI__).toBeDefined();
    });
  });
});
