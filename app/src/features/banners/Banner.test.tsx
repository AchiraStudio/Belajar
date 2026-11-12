import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BannerCard, BannerCarousel } from './Banner';
import { BANNERS, bannersFor, type Banner } from './banners';

const sample: Banner[] = [
  { id: 'a', slot: 'hero', kind: 'promo', theme: 'ink', title: 'Satu', cta: 'Buka satu', to: '/kartu' },
  { id: 'b', slot: 'hero', kind: 'ad', theme: 'bamboo', title: 'Dua', cta: 'Buka dua', href: 'https://example.org/x', sponsor: 'Contoh Sponsor' },
  { id: 'c', slot: 'hero', kind: 'promo', theme: 'sun', title: 'Tiga', cta: 'Buka tiga', to: '/kuis' },
];

function mount(ui: React.ReactElement) {
  return render(<MemoryRouter>{ui}</MemoryRouter>);
}

function setReducedMotion(on: boolean) {
  window.matchMedia = vi.fn().mockImplementation((q: string) => ({
    matches: on && q.includes('prefers-reduced-motion'),
    media: q,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    onchange: null,
    dispatchEvent: vi.fn(),
  })) as any;
}

beforeEach(() => {
  vi.useFakeTimers();
  setReducedMotion(false);
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('banner slots', () => {
  it('ships a sample for every slot, so the layout is never empty', () => {
    for (const slot of ['hero', 'side', 'strip'] as const) {
      expect(bannersFor(slot).length).toBeGreaterThan(0);
    }
    expect(BANNERS.every((b) => b.cta && b.title)).toBe(true);
  });

  it('labels paid placements "Iklan" and house promotions "Promo"', () => {
    mount(<BannerCard banner={sample[1]!} />);
    expect(screen.getByText('Iklan')).toBeTruthy();
    expect(screen.getByLabelText(/^Iklan: Dua/)).toBeTruthy();
    cleanup();
    mount(<BannerCard banner={sample[0]!} />);
    expect(screen.getByText('Promo')).toBeTruthy();
  });

  it('opens external links safely and keeps in-app links inside the app', () => {
    mount(<BannerCard banner={sample[1]!} />);
    const ext = screen.getByRole('link', { name: /buka dua/i });
    expect(ext.getAttribute('target')).toBe('_blank');
    expect(ext.getAttribute('rel')).toMatch(/noopener/);
    expect(ext.getAttribute('rel')).toMatch(/sponsored/);
    cleanup();
    mount(<BannerCard banner={sample[0]!} />);
    expect(screen.getByRole('link', { name: /buka satu/i }).getAttribute('target')).toBeNull();
  });
});

describe('BannerCarousel', () => {
  it('auto-advances, and the pause button stops it', () => {
    mount(<BannerCarousel banners={sample} />);
    const dots = () => screen.getAllByRole('button', { name: /^Banner \d$/ });
    expect(dots()[0]!.getAttribute('aria-current')).toBe('true');

    act(() => {
      vi.advanceTimersByTime(6600);
    });
    expect(dots()[1]!.getAttribute('aria-current')).toBe('true');

    fireEvent.click(screen.getByRole('button', { name: /jeda/i }));
    act(() => {
      vi.advanceTimersByTime(20000);
    });
    expect(dots()[1]!.getAttribute('aria-current')).toBe('true');
    expect(screen.getByRole('button', { name: /putar/i })).toBeTruthy();
  });

  it('does not auto-advance for people who ask for reduced motion, but still lets them step through', () => {
    setReducedMotion(true);
    mount(<BannerCarousel banners={sample} />);
    act(() => {
      vi.advanceTimersByTime(30000);
    });
    expect(screen.getAllByRole('button', { name: /^Banner \d$/ })[0]!.getAttribute('aria-current')).toBe('true');

    fireEvent.click(screen.getByRole('button', { name: 'Banner berikutnya' }));
    expect(screen.getAllByRole('button', { name: /^Banner \d$/ })[1]!.getAttribute('aria-current')).toBe('true');
  });

  it('pauses while the pointer is over it, wraps around, and steps with the arrow keys', () => {
    mount(<BannerCarousel banners={sample} />);
    const region = screen.getByRole('region', { name: 'Banner pilihan' });
    fireEvent.mouseEnter(region);
    act(() => {
      vi.advanceTimersByTime(20000);
    });
    expect(screen.getAllByRole('button', { name: /^Banner \d$/ })[0]!.getAttribute('aria-current')).toBe('true');

    fireEvent.keyDown(region, { key: 'ArrowLeft' });
    expect(screen.getAllByRole('button', { name: /^Banner \d$/ })[2]!.getAttribute('aria-current')).toBe('true');
  });

  it('shows no controls for a single banner, and nothing at all for none', () => {
    const { container } = mount(<BannerCarousel banners={[sample[0]!]} />);
    expect(screen.queryByRole('button', { name: /jeda/i })).toBeNull();
    cleanup();
    const empty = mount(<BannerCarousel banners={[]} />);
    expect(empty.container.querySelector('section')).toBeNull();
    expect(container).toBeTruthy();
  });
});
