import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ThemeProvider } from '../../services/theme/ThemeContext';
import { GlobalContextMenu } from './GlobalContextMenu';

function mount(onSearch = () => {}) {
  return render(
    <ThemeProvider>
      <MemoryRouter>
        <GlobalContextMenu onSearch={onSearch} />
        <p data-testid="para">Teks biasa</p>
        <a href="https://contoh.id/x" data-testid="link">
          Tautan luar
        </a>
        <input data-testid="field" defaultValue="halo dunia" />
        <div data-native-contextmenu data-testid="native">
          bawaan
        </div>
      </MemoryRouter>
    </ThemeProvider>,
  );
}

function rightClick(el: Element) {
  const event = new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 40, clientY: 40 });
  act(() => {
    el.dispatchEvent(event);
  });
  return event;
}

beforeEach(() => {
  // A mouse (fine pointer): the menu is off for touch-only devices.
  window.matchMedia = ((query: string) => ({
    matches: query.includes('pointer: fine'),
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    onchange: null,
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
});

afterEach(() => {
  cleanup();
  // @ts-expect-error restoring the jsdom default (no matchMedia)
  delete window.matchMedia;
  vi.restoreAllMocks();
});

describe('GlobalContextMenu', () => {
  it('replaces the browser menu with the app menu', () => {
    mount();
    const event = rightClick(screen.getByTestId('para'));
    expect(event.defaultPrevented).toBe(true);
    const menu = screen.getByRole('menu');
    expect(menu).toBeTruthy();
    for (const name of ['Kembali', 'Maju', 'Muat ulang', 'Cari di Stuby', 'Ganti tema', 'Pengaturan']) {
      expect(screen.getByRole('menuitem', { name: new RegExp(name) })).toBeTruthy();
    }
    // No text under the pointer: nothing to cut or paste.
    expect(screen.queryByRole('menuitem', { name: /Potong/ })).toBeNull();
  });

  it('runs an item and closes the menu', () => {
    const onSearch = vi.fn();
    mount(onSearch);
    rightClick(screen.getByTestId('para'));
    fireEvent.click(screen.getByRole('menuitem', { name: /Cari di Stuby/ }));
    expect(onSearch).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('offers cut, copy, paste and select all on a text field', () => {
    mount();
    const field = screen.getByTestId('field') as HTMLInputElement;
    field.setSelectionRange(0, 4);
    rightClick(field);
    expect(screen.getByRole('menuitem', { name: /Potong/ }).getAttribute('aria-disabled')).toBeNull();
    expect(screen.getByRole('menuitem', { name: /Salin/ })).toBeTruthy();
    expect(screen.getByRole('menuitem', { name: /Tempel/ })).toBeTruthy();
    expect(screen.getByRole('menuitem', { name: /Pilih semua/ })).toBeTruthy();
  });

  it('pastes into the field at the selection and tells React about it', async () => {
    mount();
    const field = screen.getByTestId('field') as HTMLInputElement;
    const seen = vi.fn();
    field.addEventListener('input', seen);
    Object.assign(navigator, { clipboard: { readText: vi.fn().mockResolvedValue('ZZ'), writeText: vi.fn() } });
    field.setSelectionRange(0, 4); // "halo"
    rightClick(field);
    await act(async () => {
      fireEvent.click(screen.getByRole('menuitem', { name: /Tempel/ }));
    });
    expect(field.value).toBe('ZZ dunia');
    expect(seen).toHaveBeenCalled();
  });

  it('offers link actions on a link and copies its address', async () => {
    mount();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    rightClick(screen.getByTestId('link'));
    await act(async () => {
      fireEvent.click(screen.getByRole('menuitem', { name: /Salin alamat tautan/ }));
    });
    expect(writeText).toHaveBeenCalledWith('https://contoh.id/x');
  });

  it('leaves elements that opt out to the native menu', () => {
    mount();
    const event = rightClick(screen.getByTestId('native'));
    expect(event.defaultPrevented).toBe(false);
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('closes on Escape and on an outside press, and supports arrow keys', () => {
    mount();
    rightClick(screen.getByTestId('para'));
    const menu = screen.getByRole('menu');
    fireEvent.keyDown(menu, { key: 'ArrowDown' });
    expect(menu.getAttribute('aria-activedescendant')).toBeTruthy();
    fireEvent.keyDown(menu, { key: 'Escape' });
    expect(screen.queryByRole('menu')).toBeNull();

    rightClick(screen.getByTestId('para'));
    fireEvent.pointerDown(document.body);
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('does nothing on a touch-only device', () => {
    window.matchMedia = ((query: string) => ({ matches: false, media: query, addEventListener: () => {}, removeEventListener: () => {} })) as unknown as typeof window.matchMedia;
    mount();
    const event = rightClick(screen.getByTestId('para'));
    expect(event.defaultPrevented).toBe(false);
    expect(screen.queryByRole('menu')).toBeNull();
  });
});
