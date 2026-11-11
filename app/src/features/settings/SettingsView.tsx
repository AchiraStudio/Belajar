import React, { useState } from 'react';
import { Button, ErrorState, Icon, Input, PageHeader, Select, Skeleton, SurfaceCard, useToast, type IconName } from '../../components/ui';
import { config } from '../../config';
import { errorMessage, isUnavailableMessage, useRpcQuery } from '../../hooks/useRpcQuery';
import { dropCache, rpcCall } from '../../services/api/rpc';
import { useTheme, type ThemeMode } from '../../services/theme/ThemeContext';
import { useAuth } from '../auth';
import { useHealth } from '../health/useHealth';
import styles from './Settings.module.css';

interface SettingsResponse {
  settings: Record<string, string>;
  timezone?: string;
}

const NOTE_STYLES = [
  { value: 'ringkas', label: 'Ringkas' },
  { value: 'cornell', label: 'Cornell' },
  { value: 'sederhana', label: 'Sederhana' },
  { value: 'detail', label: 'Detail' },
  { value: 'sentence', label: 'Sentence Method' },
  { value: 'charting', label: 'Charting Method' },
  { value: 'outline', label: 'Outline Notes' },
  { value: 'worked', label: 'Worked Examples' },
];

const LANGUAGES = [
  { value: 'auto', label: 'Otomatis (ikuti bahasa materi)' },
  { value: 'id', label: 'Bahasa Indonesia' },
  { value: 'en', label: 'English' },
];

const THEMES: { mode: ThemeMode; label: string; icon: IconName }[] = [
  { mode: 'light', label: 'Terang', icon: 'sun' },
  { mode: 'dark', label: 'Gelap', icon: 'moon' },
  { mode: 'system', label: 'Otomatis', icon: 'laptop' },
];

export function SettingsView() {
  const { data, loading, error, reload } = useRpcQuery<SettingsResponse>('get_settings');
  const { theme, setTheme } = useTheme();
  const health = useHealth();
  const auth = useAuth();
  const toast = useToast();

  const [aiCheck, setAiCheck] = useState<{ busy: boolean; text?: string; tone?: 'ok' | 'info' | 'bad' }>({ busy: false });

  const checkAi = async () => {
    setAiCheck({ busy: true });
    try {
      const r = await rpcCall<{ ok?: boolean; stream_ok?: boolean; models?: string[]; error?: string }>(
        'llm_check',
        { probe_stream: true },
        { timeoutMs: 60_000 },
      );
      if (r.ok) {
        setAiCheck({
          busy: false,
          tone: r.stream_ok ? 'ok' : 'bad',
          text: `Layanan AI terhubung${r.models?.length ? ` (model: ${r.models.join(', ')})` : ''}. ${
            r.stream_ok ? 'Streaming berfungsi.' : `Streaming belum berfungsi${r.error ? `: ${r.error}` : ''}. Game dan chat membutuhkannya.`
          }`,
        });
      } else {
        setAiCheck({ busy: false, tone: 'bad', text: `Layanan AI bermasalah${r.error ? `: ${r.error}` : '.'}` });
      }
    } catch (err) {
      const text = errorMessage(err, 'Gagal memeriksa layanan AI.');
      setAiCheck({ busy: false, tone: isUnavailableMessage(text) ? 'info' : 'bad', text });
    }
  };

  const connClass = health.kind === 'ok' ? styles.connOk : health.kind === 'down' ? styles.connDown : '';

  return (
    <div className={styles.page}>
      <PageHeader eyebrow="Preferensi" title="Pengaturan" description="Atur tampilan, target belajar, dan lihat status koneksi ke server." />

      <SurfaceCard className={styles.group}>
        <div className={styles.groupHead}>
          <h2 className={styles.groupTitle}>Tampilan</h2>
          <p className={styles.groupDesc}>Tema berlaku langsung di seluruh aplikasi dan diingat di perangkat ini.</p>
        </div>
        <div role="radiogroup" aria-label="Tema tampilan" className={styles.themeSeg}>
          {THEMES.map((t) => (
            <button
              key={t.mode}
              type="button"
              role="radio"
              aria-checked={theme === t.mode}
              className={styles.themeOpt}
              onClick={() => setTheme(t.mode)}
            >
              <Icon name={t.icon} size={20} />
              {t.label}
            </button>
          ))}
        </div>
      </SurfaceCard>

      <SurfaceCard className={styles.group}>
        <div className={styles.groupHead}>
          <h2 className={styles.groupTitle}>Target & preferensi belajar</h2>
          <p className={styles.groupDesc}>Streak terhitung bila target harian tercapai atau satu kuis selesai.</p>
        </div>
        {loading && !data && <Skeleton height="180px" borderRadius="16px" aria-label="Memuat pengaturan" />}
        {error && !data && <ErrorState message={error} onRetry={reload} />}
        {data && <SettingsForm key={JSON.stringify(data.settings)} settings={data.settings} onSaved={reload} />}
      </SurfaceCard>

      <SurfaceCard className={styles.group}>
        <div className={styles.groupHead}>
          <h2 className={styles.groupTitle}>Koneksi</h2>
          <p className={styles.groupDesc}>Menunjukkan apakah aplikasi ini bisa menjangkau server Belajar. Ini bukan status layanan AI.</p>
        </div>
        <div className={`${styles.conn} ${connClass}`} role="status">
          <Icon name={health.kind === 'ok' ? 'check-circle' : health.kind === 'down' ? 'wifi-off' : 'refresh'} size={20} />
          <div className={styles.connText}>
            <strong>
              {health.kind === 'loading' ? 'Memeriksa server…' : health.kind === 'ok' ? 'Server terhubung' : 'Server tidak terjangkau'}
            </strong>
            <span>{health.kind === 'ok' ? `Versi server ${health.version}` : health.kind === 'down' ? health.message : 'Mohon tunggu sebentar.'}</span>
          </div>
        </div>
        <div className={styles.actions}>
          <Button variant="outline" icon="sparkles" loading={aiCheck.busy} onClick={checkAi}>
            Tes layanan AI
          </Button>
        </div>
        {aiCheck.text && (
          <p className={styles.result} role="status">
            {aiCheck.text}
          </p>
        )}
        <dl className={styles.kv}>
          <dt>Alamat server</dt>
          <dd>{config.apiBaseUrl || 'Sama dengan alamat halaman ini'}</dd>
          {data?.timezone && (
            <>
              <dt>Zona waktu</dt>
              <dd>{data.timezone}</dd>
            </>
          )}
        </dl>
      </SurfaceCard>

      <SurfaceCard className={styles.group}>
        <div className={styles.groupHead}>
          <h2 className={styles.groupTitle}>Akun</h2>
          <p className={styles.groupDesc}>Keluar dari sesi di perangkat ini. Datamu tetap aman di server.</p>
        </div>
        <div className={styles.actions}>
          <Button variant="outline" icon="log-out" onClick={() => void auth.logout()}>
            Keluar
          </Button>
        </div>
      </SurfaceCard>
    </div>
  );
}

function SettingsForm({ settings, onSaved }: { settings: Record<string, string>; onSaved: () => void }) {
  const toast = useToast();
  const [daily, setDaily] = useState(settings.daily_goal_min ?? '');
  const [weekly, setWeekly] = useState(settings.weekly_goal_min ?? '');
  const [style, setStyle] = useState(settings.notes_style ?? 'ringkas');
  const [language, setLanguage] = useState(settings.language ?? 'auto');
  const [saving, setSaving] = useState(false);

  const dailyN = Number(daily);
  const weeklyN = Number(weekly);
  const dailyErr = daily !== '' && (!Number.isFinite(dailyN) || dailyN < 1 || dailyN > 600) ? 'Isi antara 1 dan 600 menit.' : undefined;
  const weeklyErr = weekly !== '' && (!Number.isFinite(weeklyN) || weeklyN < 10 || weeklyN > 3000) ? 'Isi antara 10 dan 3000 menit.' : undefined;

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving || dailyErr || weeklyErr) return;
    setSaving(true);
    try {
      await rpcCall('save_settings', {
        settings: { daily_goal_min: daily, weekly_goal_min: weekly, notes_style: style, language },
      });
      dropCache();
      toast.success('Pengaturan disimpan');
      onSaved();
    } catch (err) {
      toast.error(errorMessage(err, 'Gagal menyimpan pengaturan.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={save} className={styles.group} noValidate>
      <div className={styles.two}>
        <Input label="Target harian (menit)" type="number" inputMode="numeric" min={1} max={600} value={daily} onChange={(e) => setDaily(e.target.value)} error={dailyErr} />
        <Input label="Target mingguan (menit)" type="number" inputMode="numeric" min={10} max={3000} value={weekly} onChange={(e) => setWeekly(e.target.value)} error={weeklyErr} />
      </div>
      <div className={styles.two}>
        <Select label="Gaya catatan bawaan" value={style} onChange={(e) => setStyle(e.target.value)} options={NOTE_STYLES} />
        <Select label="Bahasa hasil AI" value={language} onChange={(e) => setLanguage(e.target.value)} options={LANGUAGES} />
      </div>
      <div className={styles.actions}>
        <Button type="submit" loading={saving} disabled={Boolean(dailyErr || weeklyErr)}>
          Simpan pengaturan
        </Button>
      </div>
    </form>
  );
}
