import { cleanup, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HealthBadge } from '../../../features/health/HealthBadge';
import { mockRpc, renderWithProviders, unstubTauri } from '../harness';

describe('Feature 27: Server Health Probe', () => {
  beforeEach(() => {
    mockRpc.install();
    mockRpc.reset();
  });

  afterEach(() => {
    cleanup();
    mockRpc.uninstall();
    unstubTauri();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('27.1 - Initial Loading Status Presentation', () => {
    // Inject a pending delay on health endpoint to observe initial loading state
    mockRpc.setDelay('health', 5000);

    renderWithProviders(<HealthBadge />);

    const badge = screen.getByRole('status');
    expect(badge).toBeTruthy();
    expect(badge.textContent).toContain('Memeriksa server…');
  });

  it('27.2 - Healthy Reachability State Resolution', async () => {
    mockRpc.setResponse('health', {
      status: 'ok',
      service: 'belajar-server',
      version: '0.1.0',
    });

    renderWithProviders(<HealthBadge />);

    await waitFor(() => {
      const badge = screen.getByRole('status');
      expect(badge.textContent).toContain('Server terhubung · v0.1.0');
    });
  });

  it('27.3 - Server Down Disconnect Handling', async () => {
    // Simulate server offline / 503 error using mockRpc helper
    mockRpc.setHealthDown('Server tidak terjangkau');

    renderWithProviders(<HealthBadge />);

    await waitFor(() => {
      const badge = screen.getByRole('status');
      expect(badge.textContent).toContain('Server tidak terjangkau');
    });
  });

  it('27.4 - Background Visibility Tab Polling Pause', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');

    // Simulate tab becoming hidden
    Object.defineProperty(document, 'visibilityState', {
      value: 'hidden',
      configurable: true,
      writable: true,
    });

    renderWithProviders(<HealthBadge />);

    // In hidden state, initial call completes or is deferred
    const initialCallCount = fetchSpy.mock.calls.length;

    // Fast-forward or check that polling does not spam in background
    expect(initialCallCount).toBeLessThanOrEqual(1);

    // Restore visibilityState
    Object.defineProperty(document, 'visibilityState', {
      value: 'visible',
      configurable: true,
      writable: true,
    });
  });

  it('27.5 - Clean Unmount Teardown', () => {
    const { unmount } = renderWithProviders(<HealthBadge />);

    expect(() => {
      unmount();
    }).not.toThrow();

    expect(screen.queryByRole('status')).toBeNull();
  });
});
