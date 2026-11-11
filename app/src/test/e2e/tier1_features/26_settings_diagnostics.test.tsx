import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import React, { useEffect, useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { Select } from '../../../components/ui/Select';
import { rpcCall } from '../../../services/api/rpc';
import { useTheme } from '../../../services/theme/ThemeContext';
import {
  defaultGetSettingsFixture,
  defaultHealthFixture,
  defaultLlmCheckFixture,
  mockRpc,
  renderWithProviders,
  unstubTauri,
  type GetSettingsResponse,
  type HealthResponse,
  type LlmCheckResponse,
  type SaveSettingsResponse,
} from '../harness';

function SettingsDiagnosticsView() {
  const { theme, setTheme } = useTheme();
  const [dailyGoal, setDailyGoal] = useState('30');
  const [weeklyGoal, setWeeklyGoal] = useState('150');
  const [notesStyle, setNotesStyle] = useState('cornell');
  const [language, setLanguage] = useState('id');
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [llmStatus, setLlmStatus] = useState<LlmCheckResponse | null>(null);
  const [serverHealth, setServerHealth] = useState<HealthResponse | null>(null);

  useEffect(() => {
    let active = true;
    Promise.all([
      rpcCall<GetSettingsResponse>('get_settings'),
      fetch('/api/v1/health').then((r) => r.json() as Promise<HealthResponse>),
    ])
      .then(([settingsRes, healthRes]) => {
        if (active) {
          setDailyGoal(settingsRes.settings.daily_goal_minutes || '30');
          setWeeklyGoal(settingsRes.settings.weekly_goal_minutes || '150');
          setNotesStyle(settingsRes.settings.notes_style || 'cornell');
          setLanguage(settingsRes.settings.language || 'id');
          setServerHealth(healthRes);
        }
      })
      .catch(() => {});

    return () => {
      active = false;
    };
  }, []);

  const handleSaveSettings = async () => {
    await rpcCall<SaveSettingsResponse>('save_settings', {
      settings: {
        daily_goal_minutes: dailyGoal,
        weekly_goal_minutes: weeklyGoal,
        notes_style: notesStyle,
        language,
        theme,
      },
    });
    setToastMessage('Pengaturan berhasil disimpan');
  };

  const handleTestLlm = async () => {
    const res = await rpcCall<LlmCheckResponse>('llm_check');
    setLlmStatus(res);
  };

  return (
    <main aria-label="Pengaturan">
      <header>
        <h1>Pengaturan & Diagnostik</h1>
      </header>

      {/* Target Belajar */}
      <section role="region" aria-label="Target Belajar">
        <h2>Target Belajar</h2>
        <label htmlFor="daily-goal">Target Harian (Menit)</label>
        <Input
          id="daily-goal"
          type="number"
          aria-label="Target Harian"
          value={dailyGoal}
          onChange={(e) => setDailyGoal(e.target.value)}
        />

        <label htmlFor="weekly-goal">Target Mingguan (Menit)</label>
        <Input
          id="weekly-goal"
          type="number"
          aria-label="Target Mingguan"
          value={weeklyGoal}
          onChange={(e) => setWeeklyGoal(e.target.value)}
        />
      </section>

      {/* Preferensi Belajar */}
      <section role="region" aria-label="Preferensi Catatan dan AI">
        <h2>Preferensi</h2>
        <label htmlFor="notes-style">Gaya Catatan</label>
        <Select
          id="notes-style"
          aria-label="Gaya Catatan"
          value={notesStyle}
          onChange={(e) => setNotesStyle(e.target.value)}
        >
          <option value="cornell">Cornell</option>
          <option value="mindmap">Mind Map</option>
          <option value="bullet">Outline Bullet</option>
        </Select>

        <label htmlFor="language">Bahasa Hasil AI</label>
        <Select
          id="language"
          aria-label="Bahasa Hasil AI"
          value={language}
          onChange={(e) => setLanguage(e.target.value)}
        >
          <option value="id">Bahasa Indonesia</option>
          <option value="en">English</option>
        </Select>
      </section>

      {/* Tema Tampilan */}
      <section role="region" aria-label="Tema Tampilan">
        <h2>Tema Tampilan</h2>
        <div role="group" aria-label="Tema Tampilan">
          <Button
            variant={theme === 'system' ? 'primary' : 'outline'}
            onClick={() => setTheme('system')}
            aria-label="Otomatis"
          >
            Otomatis
          </Button>
          <Button
            variant={theme === 'light' ? 'primary' : 'outline'}
            onClick={() => setTheme('light')}
            aria-label="Terang"
          >
            Terang
          </Button>
          <Button
            variant={theme === 'dark' ? 'primary' : 'outline'}
            onClick={() => setTheme('dark')}
            aria-label="Gelap"
          >
            Gelap
          </Button>
        </div>
      </section>

      {/* Aksi Simpan */}
      <div>
        <Button onClick={handleSaveSettings} aria-label="Simpan Pengaturan">
          Simpan Pengaturan
        </Button>
      </div>

      {toastMessage && (
        <div role="status" aria-label="Notifikasi Simpan">
          {toastMessage}
        </div>
      )}

      {/* Diagnostik AI & Server */}
      <section role="region" aria-label="Diagnostik Sistem">
        <h2>Diagnostik Sistem</h2>
        <Button onClick={handleTestLlm} aria-label="Tes Koneksi AI">
          Tes Koneksi AI
        </Button>

        {llmStatus && (
          <div role="status" aria-label="Status Diagnostik AI">
            <p>Status: {llmStatus.ok ? 'Terhubung' : 'Gagal'}</p>
            <p>Provider: {llmStatus.provider}</p>
            <p>Model: {llmStatus.model}</p>
            <p>Latensi: {llmStatus.latency_ms}ms</p>
          </div>
        )}

        {serverHealth && (
          <div role="status" aria-label="Status Server">
            <p>Server Status: {serverHealth.status}</p>
            <p>Versi Server: {serverHealth.version}</p>
          </div>
        )}
      </section>
    </main>
  );
}

describe('Feature 26: Settings & Diagnostics', () => {
  beforeEach(() => {
    mockRpc.install();
    mockRpc.reset();
    mockRpc.setResponse('get_settings', defaultGetSettingsFixture);
    mockRpc.setResponse('save_settings', { settings: {} });
    mockRpc.setResponse('llm_check', defaultLlmCheckFixture);
    if (typeof window !== 'undefined') {
      window.localStorage.clear();
      document.documentElement.removeAttribute('data-theme');
      document.documentElement.style.colorScheme = '';
    }
  });

  afterEach(() => {
    cleanup();
    mockRpc.uninstall();
    unstubTauri();
    vi.restoreAllMocks();
    vi.useRealTimers();
    if (typeof window !== 'undefined') {
      window.localStorage.clear();
      document.documentElement.removeAttribute('data-theme');
      document.documentElement.style.colorScheme = '';
    }
  });

  it('26.1 - renders user study goals and preference inputs populated with current settings', async () => {
    renderWithProviders(<SettingsDiagnosticsView />);

    await waitFor(() => {
      expect(
        screen.getByRole('heading', { level: 1, name: 'Pengaturan & Diagnostik' })
      ).toBeTruthy();

      const dailyInput = screen.getByRole('spinbutton', { name: 'Target Harian' });
      expect((dailyInput as HTMLInputElement).value).toBe('30');

      const weeklyInput = screen.getByRole('spinbutton', { name: 'Target Mingguan' });
      expect((weeklyInput as HTMLInputElement).value).toBe('150');

      const notesSelect = screen.getByRole('combobox', { name: 'Gaya Catatan' });
      expect((notesSelect as HTMLSelectElement).value).toBe('cornell');

      const langSelect = screen.getByRole('combobox', { name: 'Bahasa Hasil AI' });
      expect((langSelect as HTMLSelectElement).value).toBe('id');
    });
  });

  it('26.2 - saves updated study goals and preferences', async () => {
    renderWithProviders(<SettingsDiagnosticsView />);

    const dailyInput = await screen.findByRole('spinbutton', { name: 'Target Harian' });
    fireEvent.change(dailyInput, { target: { value: '45' } });

    const saveBtn = screen.getByRole('button', { name: 'Simpan Pengaturan' });
    fireEvent.click(saveBtn);

    await waitFor(() => {
      const call = mockRpc.getLastCall('save_settings');
      expect(call).toBeTruthy();
      expect(call?.payload.settings.daily_goal_minutes).toBe('45');

      const toast = screen.getByRole('status', { name: 'Notifikasi Simpan' });
      expect(toast.textContent).toContain('Pengaturan berhasil disimpan');
    });
  });

  it('26.3 - switches application theme mode with persistence', async () => {
    renderWithProviders(<SettingsDiagnosticsView />, {
      themeStorageKey: 'belajar-theme',
    });

    const darkBtn = await screen.findByRole('button', { name: 'Gelap' });
    fireEvent.click(darkBtn);

    await waitFor(() => {
      expect(window.localStorage.getItem('belajar-theme')).toBe('dark');
      expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    });
  });

  it('26.4 - runs AI gateway diagnostic test and displays latency and model info', async () => {
    renderWithProviders(<SettingsDiagnosticsView />);

    const testAiBtn = await screen.findByRole('button', { name: 'Tes Koneksi AI' });
    fireEvent.click(testAiBtn);

    await waitFor(() => {
      const call = mockRpc.getLastCall('llm_check');
      expect(call).toBeTruthy();

      const status = screen.getByRole('status', { name: 'Status Diagnostik AI' });
      expect(status.textContent).toContain('Terhubung');
      expect(status.textContent).toContain('gemini');
      expect(status.textContent).toContain('gemini-1.5-flash');
      expect(status.textContent).toContain('210ms');
    });
  });

  it('26.5 - displays server diagnostics with health status and version', async () => {
    renderWithProviders(<SettingsDiagnosticsView />);

    await waitFor(() => {
      const healthStatus = screen.getByRole('status', { name: 'Status Server' });
      expect(healthStatus.textContent).toContain('Server Status: ok');
      expect(healthStatus.textContent).toContain('Versi Server: 0.1.0');
    });
  });
});
