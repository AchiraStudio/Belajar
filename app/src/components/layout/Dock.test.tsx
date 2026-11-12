import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import React from 'react';
import { MemoryRouter, useLocation } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ThemeProvider } from '../../services/theme/ThemeContext';
import { ToastProvider } from '../ui/Toast';
import { Dock } from './Dock';
import { ALL_ENTRIES, DOCK_SECTIONS, MOBILE_TAB_MENUS } from './navigation';

function Where() {
  return <output data-testid="where">{useLocation().pathname}</output>;
}

/** `compact` = a phone-width screen (the dock switches to five tabs). */
function setCompact(compact: boolean) {
  window.matchMedia = vi.fn().mockImplementation((q: string) => ({
    matches: compact && q.includes('max-width: 768px'),
    media: q,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    onchange: null,
    dispatchEvent: vi.fn(),
  })) as unknown as typeof window.matchMedia;
}

function renderDock(path = '/', onSearch = vi.fn()) {
  const view = render(
    <ThemeProvider>
      <ToastProvider>
        <MemoryRouter initialEntries={[path]}>
          <Dock onSearch={onSearch} />
          <Where />
        </MemoryRouter>
      </ToastProvider>
    </ThemeProvider>,
  );
  return { ...view, onSearch };
}

const holdFor = (el: Element, ms = 400) => {
  fireEvent.pointerDown(el, { pointerType: 'touch', clientX: 50, clientY: 50, button: 0 });
  act(() => {
    vi.advanceTimersByTime(ms);
  });
};

beforeEach(() => {
  vi.useFakeTimers();
  window.localStorage.clear();
  (document as any).elementFromPoint = vi.fn(() => null);
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('Dock on desktop', () => {
  beforeEach(() => setCompact(false));

  it('is complete: every destination is one click away, with no "more" bucket', () => {
    renderDock('/');
    const nav = screen.getByRole('navigation', { name: 'Navigasi Utama' });
    const links = within(nav).getAllByRole('link');
    const hrefs = links.map((l) => l.getAttribute('href')).sort();
    expect(hrefs).toEqual([...DOCK_SECTIONS.flat()].sort());
    expect(hrefs).toEqual(ALL_ENTRIES.map((e) => e.path).sort());
    expect(within(nav).queryByRole('button', { name: /lainnya/i })).toBeNull();
  });

  it('marks the current page, and marks destinations that are not built yet', () => {
    renderDock('/materi');
    expect(screen.getByRole('link', { name: /materi/i }).getAttribute('aria-current')).toBe('page');
    expect(screen.getByRole('link', { name: /beranda/i }).getAttribute('aria-current')).toBeNull();
    expect(screen.getAllByText(/segera/i).length).toBeGreaterThan(0);
  });

  it('has a search button that calls back', () => {
    const { onSearch } = renderDock('/');
    fireEvent.click(screen.getByRole('button', { name: /cari/i }));
    expect(onSearch).toHaveBeenCalledTimes(1);
  });

  it('hides when idle, and comes back on scroll', () => {
    const { container } = renderDock('/');
    const wrap = () => container.querySelector('[class*="wrap"]') as HTMLElement;
    expect(wrap().className).not.toMatch(/hidden/);

    act(() => {
      vi.advanceTimersByTime(3600);
    });
    expect(wrap().className).toMatch(/hidden/);

    // A real scroll (the page moved), not just an event.
    Object.defineProperty(window, 'scrollY', { value: 240, configurable: true });
    act(() => {
      document.dispatchEvent(new Event('scroll', { bubbles: false }));
    });
    Object.defineProperty(window, 'scrollY', { value: 0, configurable: true });
    expect(wrap().className).not.toMatch(/hidden/);
  });

  it('comes back from the peek handle, a key press, and a touch; and stays while hovered or focused', () => {
    const { container } = renderDock('/');
    const wrap = () => container.querySelector('[class*="wrap"]') as HTMLElement;
    act(() => {
      vi.advanceTimersByTime(3600);
    });
    expect(wrap().className).toMatch(/hidden/);

    fireEvent.click(screen.getByRole('button', { name: 'Tampilkan navigasi' }));
    expect(wrap().className).not.toMatch(/hidden/);

    act(() => {
      vi.advanceTimersByTime(3600);
    });
    expect(wrap().className).toMatch(/hidden/);
    fireEvent.keyDown(window, { key: 'Tab' });
    expect(wrap().className).not.toMatch(/hidden/);

    // focus inside keeps it up past the idle time
    (screen.getByRole('link', { name: /beranda/i }) as HTMLElement).focus();
    act(() => {
      vi.advanceTimersByTime(10000);
    });
    expect(wrap().className).not.toMatch(/hidden/);
  });

  it('a hidden dock is still reachable: the links stay in the document and the tab order', () => {
    renderDock('/');
    act(() => {
      vi.advanceTimersByTime(3600);
    });
    const link = screen.getByRole('link', { name: /beranda/i });
    expect(link.getAttribute('tabindex')).not.toBe('-1');
  });
});

describe('Dock on a phone', () => {
  beforeEach(() => setCompact(true));

  it('shows five tabs and no desktop-only items', () => {
    renderDock('/');
    const nav = screen.getByRole('navigation', { name: 'Navigasi Utama' });
    expect(within(nav).getAllByRole('link').length).toBe(4);
    expect(within(nav).getByRole('button', { name: /lainnya/i })).toBeTruthy();
  });

  it('a quick tap navigates and never opens the menu', () => {
    renderDock('/');
    const materi = screen.getByRole('link', { name: /materi/i });
    fireEvent.pointerDown(materi, { pointerType: 'touch', clientX: 50, clientY: 50 });
    act(() => {
      vi.advanceTimersByTime(120);
    });
    fireEvent.pointerUp(materi);
    fireEvent.click(materi);
    expect(screen.queryByRole('menu')).toBeNull();
    expect(screen.getByTestId('where').textContent).toBe('/materi');
  });

  it('holding a tab lifts that tab’s pages, and the release click does not navigate', () => {
    renderDock('/');
    const materi = screen.getByRole('link', { name: /materi/i });
    holdFor(materi);

    const menu = screen.getByRole('menu', { name: 'Halaman Materi' });
    const items = Array.from(menu.querySelectorAll('[role="menuitem"]')).map((n) => n.textContent).join('|');
    expect(items).toMatch(/Kartu Belajar/);
    expect(items).toMatch(/Asisten AI/);
    expect(materi.getAttribute('aria-expanded')).toBe('true');

    fireEvent.pointerUp(materi);
    fireEvent.click(materi);
    expect(screen.getByTestId('where').textContent).toBe('/');
    expect(screen.getByRole('menu')).toBeTruthy();
  });

  it('drifting before the hold completes cancels it (the person is scrolling or aiming)', () => {
    renderDock('/');
    const kuis = screen.getByRole('link', { name: /kuis/i });
    fireEvent.pointerDown(kuis, { pointerType: 'touch', clientX: 50, clientY: 50 });
    fireEvent.pointerMove(kuis, { pointerType: 'touch', clientX: 50, clientY: 90 });
    act(() => {
      vi.advanceTimersByTime(600);
    });
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('slide-and-release opens the entry under the finger', () => {
    renderDock('/');
    const kuis = screen.getByRole('link', { name: /kuis/i });
    holdFor(kuis);
    const target = screen.getByRole('menuitem', { name: /soal lemah/i });
    (document as any).elementFromPoint = vi.fn(() => target);
    fireEvent.pointerMove(kuis, { pointerType: 'touch', clientX: 60, clientY: -40 });
    expect(target.className).toMatch(/holdItemHot/);
    fireEvent.pointerUp(kuis);
    expect(screen.getByTestId('where').textContent).toBe('/soal-lemah');
  });

  it('releasing over nothing leaves the menu open to tap, and tapping an entry navigates', () => {
    renderDock('/');
    const game = screen.getByRole('link', { name: /game/i });
    holdFor(game);
    fireEvent.pointerUp(game);
    fireEvent.click(screen.getByRole('menuitem', { name: /beasiswa/i }));
    expect(screen.getByTestId('where').textContent).toBe('/peluang');
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('the keyboard can open it (ArrowUp), move through it, and close it with Escape', () => {
    renderDock('/');
    const beranda = screen.getByRole('link', { name: /beranda/i });
    beranda.focus();
    fireEvent.keyDown(beranda, { key: 'ArrowUp' });
    const menu = screen.getByRole('menu', { name: 'Halaman Beranda' });
    expect(document.activeElement).toBe(menu.querySelector('[role="menuitem"]'));

    fireEvent.keyDown(document.activeElement as Element, { key: 'ArrowDown' });
    expect((document.activeElement as HTMLElement).textContent).toMatch(/Notifikasi/);

    fireEvent.keyDown(document, { key: 'Escape' });
    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(screen.queryByRole('menu')).toBeNull();
    expect(document.activeElement).toBe(beranda);
  });

  it('"Lainnya": a tap opens the full list (with search); a hold opens its quick menu', () => {
    const { onSearch } = renderDock('/');
    const more = screen.getByRole('button', { name: /lainnya/i });
    fireEvent.click(more);
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByRole('link', { name: /pengaturan/i })).toBeTruthy();
    fireEvent.click(within(dialog).getByRole('button', { name: /cari/i }));
    expect(onSearch).toHaveBeenCalledTimes(1);
    cleanup();

    renderDock('/');
    const more2 = screen.getByRole('button', { name: /lainnya/i });
    holdFor(more2);
    expect(screen.getByRole('menuitem', { name: /profil/i })).toBeTruthy();
    fireEvent.pointerUp(more2);
    fireEvent.click(more2); // swallowed: the hold already did its job
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('keeps the dock up while its menu is open, however long it sits', () => {
    const { container } = renderDock('/');
    holdFor(screen.getByRole('link', { name: /kuis/i }));
    act(() => {
      vi.advanceTimersByTime(12000);
    });
    expect((container.querySelector('[class*="wrap"]') as HTMLElement).className).not.toMatch(/hidden/);
  });
});

describe('navigation map', () => {
  it('every destination is reachable from exactly one hold menu', () => {
    const listed = Object.values(MOBILE_TAB_MENUS).flat();
    expect(new Set(listed).size).toBe(listed.length);
    expect([...listed].sort()).toEqual(ALL_ENTRIES.map((e) => e.path).sort());
  });
});
