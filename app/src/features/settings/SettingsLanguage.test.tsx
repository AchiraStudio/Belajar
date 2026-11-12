import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { dropCache } from '../../services/api/rpc';
import { I18nProvider, LANGUAGE_STORAGE_KEY } from '../../services/i18n';
import { setCurrentLanguage } from '../../services/i18n/translate';
import { mockRpc, renderWithProviders } from '../../test/e2e/harness';
import { SettingsView } from '.';

function renderSettings(initial: 'en' | 'id' | 'es' | 'zh' = 'en') {
  return renderWithProviders(
    <I18nProvider initial={initial}>
      <SettingsView />
    </I18nProvider>,
    { route: '/pengaturan' },
  );
}

describe('Settings: language', () => {
  beforeEach(() => {
    cleanup();
    dropCache();
    window.localStorage.clear();
    mockRpc.install();
    mockRpc.reset();
    mockRpc.setResponse('get_settings', { settings: { daily_goal_min: '30', weekly_goal_min: '150', notes_style: 'ringkas', language: 'auto' }, timezone: 'Asia/Jakarta' });
  });
  afterEach(() => {
    cleanup();
    mockRpc.uninstall();
    setCurrentLanguage('id');
    vi.restoreAllMocks();
  });

  it('offers English, Indonesian, Spanish and Chinese, with the current one selected', async () => {
    renderSettings('en');
    const group = await screen.findByRole('radiogroup', { name: 'Display language' });
    const options = within(group).getAllByRole('radio');
    expect(options.map((o) => o.textContent)).toEqual([
      expect.stringContaining('English'),
      expect.stringContaining('Bahasa Indonesia'),
      expect.stringContaining('Español'),
      expect.stringContaining('中文'),
    ]);
    expect(options[0]!.getAttribute('aria-checked')).toBe('true');
    expect(screen.getByRole('heading', { name: 'Settings' })).toBeTruthy();
  });

  it('switching language translates the page at once and remembers the choice', async () => {
    renderSettings('en');
    const group = await screen.findByRole('radiogroup', { name: 'Display language' });
    fireEvent.click(within(group).getByRole('radio', { name: /Español/ }));

    expect(await screen.findByRole('heading', { name: 'Ajustes' })).toBeTruthy();
    expect(screen.getByRole('radiogroup', { name: 'Idioma de la interfaz' })).toBeTruthy();
    expect(window.localStorage.getItem(LANGUAGE_STORAGE_KEY)).toBe('es');

    fireEvent.click(screen.getByRole('radio', { name: /中文/ }));
    expect(await screen.findByRole('heading', { name: '设置' })).toBeTruthy();
    expect(document.documentElement.lang).toBe('zh');
  });

  it('arrow keys move the selection like native radios', async () => {
    renderSettings('en');
    const group = await screen.findByRole('radiogroup', { name: 'Display language' });
    const english = within(group).getByRole('radio', { name: /English/ });
    english.focus();
    fireEvent.keyDown(english, { key: 'ArrowRight' });
    expect(await screen.findByRole('heading', { name: 'Pengaturan' })).toBeTruthy(); // now Indonesian
  });

  it('only warns about untranslated pages when the language is not the source language', async () => {
    renderSettings('en');
    expect(await screen.findByRole('note')).toBeTruthy();
    cleanup();
    renderSettings('id');
    await screen.findByRole('heading', { name: 'Pengaturan' });
    expect(screen.queryByRole('note')).toBeNull();
  });

  it('still saves the study settings, and shows the validation in the chosen language', async () => {
    mockRpc.setResponse('save_settings', { ok: true });
    renderSettings('es');
    const daily = await screen.findByLabelText('Objetivo diario (minutos)');
    fireEvent.change(daily, { target: { value: '900' } });
    expect(await screen.findByText('Introduce entre 1 y 600 minutos.')).toBeTruthy();

    fireEvent.change(daily, { target: { value: '45' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar ajustes' }));
    await waitFor(() => expect(mockRpc.getLastCall('save_settings')).toBeTruthy());
  });

  it('resets only this app’s local preferences, after a confirmation', async () => {
    const reload = vi.fn();
    Object.defineProperty(window, 'location', { value: { ...window.location, reload }, writable: true });
    window.localStorage.setItem('stuby-theme', 'dark');
    window.localStorage.setItem('stuby-sidebar-collapsed', 'true');
    window.localStorage.setItem('someone-elses-key', 'keep');

    renderSettings('en');
    fireEvent.click(await screen.findByRole('button', { name: 'Reset display preferences' }));
    const dialog = await screen.findByRole('dialog');
    expect(window.localStorage.getItem('stuby-theme')).toBe('dark'); // nothing happens before confirming

    fireEvent.click(within(dialog).getByRole('button', { name: 'Reset' }));
    expect(window.localStorage.getItem('stuby-theme')).toBeNull();
    expect(window.localStorage.getItem('stuby-sidebar-collapsed')).toBeNull();
    expect(window.localStorage.getItem('someone-elses-key')).toBe('keep');
    expect(reload).toHaveBeenCalled();
  });
});
