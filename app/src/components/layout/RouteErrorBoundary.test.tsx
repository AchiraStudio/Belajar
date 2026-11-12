import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RouteErrorBoundary } from './RouteErrorBoundary';

let shouldThrow = true;
function Bomb() {
  if (shouldThrow) throw new Error('boom');
  return <p>halaman sehat</p>;
}

function renderBoundary(resetKey: string) {
  return (
    <MemoryRouter>
      <RouteErrorBoundary resetKey={resetKey}>
        <Bomb />
      </RouteErrorBoundary>
    </MemoryRouter>
  );
}

describe('RouteErrorBoundary', () => {
  beforeEach(() => {
    shouldThrow = true;
    // React logs caught render errors; keep the test output clean.
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('shows an honest error with a way home instead of blanking the app', () => {
    render(renderBoundary('/game'));
    expect(screen.getByRole('alert')).toBeTruthy();
    expect(screen.getByText('Halaman ini tidak bisa ditampilkan')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Kembali ke beranda' })).toBeTruthy();
  });

  it('recovers when the user retries after the cause is gone', () => {
    const { rerender } = render(renderBoundary('/game'));
    shouldThrow = false;
    fireEvent.click(screen.getByRole('button', { name: 'Muat ulang halaman' }));
    rerender(renderBoundary('/game'));
    expect(screen.getByText('halaman sehat')).toBeTruthy();
  });

  it('clears the error when the route changes', () => {
    const { rerender } = render(renderBoundary('/game'));
    expect(screen.getByRole('alert')).toBeTruthy();
    shouldThrow = false;
    rerender(renderBoundary('/kuis'));
    expect(screen.getByText('halaman sehat')).toBeTruthy();
  });
});
