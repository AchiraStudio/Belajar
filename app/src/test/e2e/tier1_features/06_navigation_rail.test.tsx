import { cleanup, fireEvent, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Sidebar } from '../../../components/layout/Sidebar';
import { mockRpc, renderWithProviders, unstubTauri } from '../harness';

describe('Feature 6: Responsive Navigation Rail', () => {
  beforeEach(() => {
    if (typeof window !== 'undefined') {
      window.localStorage.clear();
    }
    mockRpc.install();
    mockRpc.reset();
  });

  afterEach(() => {
    cleanup();
    mockRpc.uninstall();
    unstubTauri();
    vi.restoreAllMocks();
    vi.useRealTimers();
    if (typeof window !== 'undefined') {
      window.localStorage.clear();
    }
  });

  it('06.1 - Grouped Indonesian Navigation Architecture', () => {
    renderWithProviders(<Sidebar />);

    const nav = screen.getByLabelText('Navigasi Utama');
    expect(nav).toBeTruthy();

    // Verify the grouped sections of the expanded product navigation
    expect(screen.getByText('Belajar')).toBeTruthy();
    expect(screen.getByText('Jelajahi')).toBeTruthy();
    expect(screen.getByRole('link', { name: /beasiswa & peluang/i })).toBeTruthy();
    expect(screen.getByRole('link', { name: /pengaturan/i })).toBeTruthy();
  });

  it('06.2 - Active Link State Highlighting', () => {
    renderWithProviders(<Sidebar />, { route: '/materi' });

    const materiLink = screen.getByRole('link', { name: /materi/i });
    expect(materiLink.getAttribute('aria-current')).toBe('page');

    const berandaLink = screen.getByRole('link', { name: /beranda/i });
    expect(berandaLink.getAttribute('aria-current')).toBeNull();
  });

  it('06.3 - Collapse Toggle State Transformation', () => {
    renderWithProviders(<Sidebar />);

    const toggleBtn = screen.getByRole('button', { name: 'Ciutkan bilah navigasi' });
    expect(toggleBtn).toBeTruthy();

    // Click collapse
    fireEvent.click(toggleBtn);

    const expandBtn = screen.getByRole('button', { name: 'Perluas bilah navigasi' });
    expect(expandBtn).toBeTruthy();

    const sidebar = screen.getByLabelText('Navigasi Utama');
    expect(sidebar.className).toMatch(/collapsed/);
  });

  it('06.4 - LocalStorage Persistence of Sidebar Width', () => {
    renderWithProviders(<Sidebar />);

    const toggleBtn = screen.getByRole('button', { name: 'Ciutkan bilah navigasi' });
    fireEvent.click(toggleBtn);

    expect(window.localStorage.getItem('belajar-sidebar-collapsed')).toBe('true');

    cleanup();

    // Re-mount: should initialize in collapsed state
    renderWithProviders(<Sidebar />);
    expect(screen.getByRole('button', { name: 'Perluas bilah navigasi' })).toBeTruthy();
  });

  it('06.5 - Brand Header Link Navigation', () => {
    renderWithProviders(<Sidebar />);

    const brandLink = screen.getByTitle('Beranda Belajar');
    expect(brandLink).toBeTruthy();
    expect(brandLink.getAttribute('href')).toBe('/');
    expect(brandLink.textContent).toContain('belajar');
  });
});
