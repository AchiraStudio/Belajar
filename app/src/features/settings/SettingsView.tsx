import React, { useRef, useState } from 'react';
import { Button, Dialog, Dropdown, ErrorState, Icon, Input, PageHeader, Select, Skeleton, SurfaceCard, useToast, type IconName } from '../../components/ui';
import { useMediaQuery } from '../../hooks/useMediaQuery';
import { config } from '../../config';
import { errorMessage, isUnavailableMessage, useRpcQuery } from '../../hooks/useRpcQuery';
import { dropCache, rpcCall } from '../../services/api/rpc';
import { LANGUAGES, useI18n } from '../../services/i18n';
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

const AI_LANGUAGES = [
  { value: 'auto', label: 'Otomatis (ikuti bahasa materi)' },
  { value: 'id', label: 'Bahasa Indonesia' },
  { value: 'en', label: 'English' },
];

const THEMES: { mode: ThemeMode; label: string; icon: IconName }[] = [
  { mode: 'light', label: 'Terang', icon: 'sun' },
  { mode: 'dark', label: 'Gelap', icon: 'moon' },
  { mode: 'system', label: 'Otomatis', icon: 'laptop' },
];

/** Local preferences this app writes. "Reset" clears exactly these (keys all start with `stuby-`). */
const LOCAL_PREFIX = 'stuby-';

/**
 * A radio group made of cards. Arrow keys move the selection (and focus) like native radios do,
 * and only the selected card is in the tab order.
 */
function RadioCards<T extends string>({
  label,
  value,
  options,
  onChange,
  className,
}: {
  label: string;
  value: T;
  /** `text` is what the dropdown shows on a phone, where the cards collapse into one. */
  options: { value: T; content: React.ReactNode; text: string; icon?: IconName }[];
  onChange: (value: T) => void;
  className?: string;
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const phone = useMediaQuery('(max-width: 768px)');
  const move = (from: number, step: number) => {
    const next = (from + step + options.length) % options.length;
    onChange(options[next]!.value);
    refs.current[next]?.focus();
  };
  if (phone) {
    return (
      <Dropdown
        aria-label={label}
        value={value}
        onChange={(v) => onChange(v as T)}
        options={options.map((o) => ({ value: o.value, label: o.text, icon: o.icon }))}
      />
    );
  }
  return (
    <div role="radiogroup" aria-label={label} className={className}>
      {options.map((o, i) => (
        <button
          key={o.value}
          ref={(n) => {
            refs.current[i] = n;
          }}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          tabIndex={value === o.value ? 0 : -1}
          className={styles.themeOpt}
          onClick={() => onChange(o.value)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
              e.preventDefault();
              move(i, 1);
            } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
              e.preventDefault();
              move(i, -1);
            }
          }}
        >
          {o.content}
        </button>
      ))}
    </div>
  );
}

export function SettingsView() {
  const { data, loading, error, reload } = useRpcQuery<SettingsResponse>('get_settings');
  const { theme, setTheme } = useTheme();
  const { language, setLanguage, t } = useI18n();
  const health = useHealth();
  const auth = useAuth();
  const toast = useToast();

  const [aiCheck, setAiCheck] = useState<{ busy: boolean; text?: string; tone?: 'ok' | 'info' | 'bad' }>({ busy: false });
  const [confirmReset, setConfirmReset] = useState(false);

  const checkAi = async () => {
    setAiCheck({ busy: true });
    try {
      const r = await rpcCall<{ ok?: boolean; stream_ok?: boolean; models?: string[]; error?: string }>(
        'llm_check',
        { probe_stream: true },
        { timeoutMs: 60_000 },
      );
      if (r.ok) {
        const models = r.models?.length ? ` (${t('model')}: ${r.models.join(', ')})` : '';
        setAiCheck({
          busy: false,
          tone: r.stream_ok ? 'ok' : 'bad',
          text: `${t('Layanan AI terhubung')}${models}. ${
            r.stream_ok
              ? t('Streaming berfungsi.')
              : `${t('Streaming belum berfungsi')}${r.error ? `: ${r.error}` : ''}. ${t('Game dan chat membutuhkannya.')}`
          }`,
        });
      } else {
        setAiCheck({ busy: false, tone: 'bad', text: `${t('Layanan AI bermasalah')}${r.error ? `: ${r.error}` : '.'}` });
      }
    } catch (err) {
      const text = errorMessage(err, t('Gagal memeriksa layanan AI.'));
      setAiCheck({ busy: false, tone: isUnavailableMessage(text) ? 'info' : 'bad', text });
    }
  };

  const resetLocal = () => {
    try {
      const keys: string[] = [];
      for (let i = 0; i < window.localStorage.length; i += 1) {
        const k = window.localStorage.key(i);
        if (k && k.startsWith(LOCAL_PREFIX)) keys.push(k);
      }
      keys.forEach((k) => window.localStorage.removeItem(k));
    } catch {
      /* nothing stored, nothing to reset */
    }
    window.location.reload();
  };

  const connClass = health.kind === 'ok' ? styles.connOk : health.kind === 'down' ? styles.connDown : '';

  return (
    <div className={styles.page}>
      <PageHeader eyebrow={t('Preferensi')} title={t('Pengaturan')} description={t('Atur bahasa, tampilan, target belajar, dan lihat status koneksi ke server.')} />

      <SurfaceCard className={styles.group} aria-labelledby="set-lang">
        <div className={styles.groupHead}>
          <h2 id="set-lang" className={styles.groupTitle}>
            {t('Bahasa')}
          </h2>
          <p className={styles.groupDesc}>{t('Bahasa tampilan aplikasi. Berlaku langsung dan diingat di perangkat ini.')}</p>
        </div>
        <RadioCards
          label={t('Bahasa tampilan')}
          value={language}
          onChange={setLanguage}
          className={styles.langGrid}
          options={LANGUAGES.map((l) => ({
            value: l.code,
            text: l.native,
            icon: 'globe' as const,
            content: (
              <>
                <span className={styles.langName} lang={l.code}>
                  {l.native}
                </span>
                <span className={styles.langCode} aria-hidden="true">
                  {l.code.toUpperCase()}
                </span>
                {language === l.code && <Icon name="check-circle" size={18} aria-hidden="true" />}
              </>
            ),
          }))}
        />
        {language !== 'id' && (
          <p className={styles.note} role="note">
            <Icon name="info" size={16} aria-hidden="true" />
            {t('Sebagian halaman masih diterjemahkan dan tampil dalam bahasa Indonesia untuk sementara.')}
          </p>
        )}
      </SurfaceCard>

      <SurfaceCard className={styles.group} aria-labelledby="set-theme">
        <div className={styles.groupHead}>
          <h2 id="set-theme" className={styles.groupTitle}>
            {t('Tampilan')}
          </h2>
          <p className={styles.groupDesc}>{t('Tema berlaku langsung di seluruh aplikasi dan diingat di perangkat ini.')}</p>
        </div>
        <RadioCards
          label={t('Tema tampilan')}
          value={theme}
          onChange={setTheme}
          className={styles.themeSeg}
          options={THEMES.map((o) => ({
            value: o.mode,
            text: t(o.label),
            icon: o.icon,
            content: (
              <>
                <Icon name={o.icon} size={20} />
                {t(o.label)}
              </>
            ),
          }))}
        />
      </SurfaceCard>

      <SurfaceCard className={styles.group} aria-labelledby="set-study">
        <div className={styles.groupHead}>
          <h2 id="set-study" className={styles.groupTitle}>
            {t('Target & preferensi belajar')}
          </h2>
          <p className={styles.groupDesc}>{t('Streak terhitung bila target harian tercapai atau satu kuis selesai.')}</p>
        </div>
        {loading && !data && <Skeleton height="180px" borderRadius="16px" aria-label={t('Memuat pengaturan')} />}
        {error && !data && <ErrorState message={error} onRetry={reload} />}
        {data && <SettingsForm key={JSON.stringify(data.settings)} settings={data.settings} onSaved={reload} />}
      </SurfaceCard>

      <SurfaceCard className={styles.group} aria-labelledby="set-conn">
        <div className={styles.groupHead}>
          <h2 id="set-conn" className={styles.groupTitle}>
            {t('Koneksi')}
          </h2>
          <p className={styles.groupDesc}>{t('Menunjukkan apakah aplikasi ini bisa menjangkau server Stuby. Ini bukan status layanan AI.')}</p>
        </div>
        <div className={`${styles.conn} ${connClass}`} role="status">
          <Icon name={health.kind === 'ok' ? 'check-circle' : health.kind === 'down' ? 'wifi-off' : 'refresh'} size={20} />
          <div className={styles.connText}>
            <strong>
              {health.kind === 'loading' ? t('Memeriksa server…') : health.kind === 'ok' ? t('Server terhubung') : t('Server tidak terjangkau')}
            </strong>
            <span>
              {health.kind === 'ok'
                ? t('Versi server {version}', { version: health.version })
                : health.kind === 'down'
                  ? health.message
                  : t('Mohon tunggu sebentar.')}
            </span>
          </div>
        </div>
        <div className={styles.actions}>
          <Button variant="outline" icon="sparkles" loading={aiCheck.busy} onClick={checkAi}>
            {t('Tes layanan AI')}
          </Button>
        </div>
        {aiCheck.text && (
          <p className={styles.result} role="status">
            {aiCheck.text}
          </p>
        )}
        <dl className={styles.kv}>
          <dt>{t('Alamat server')}</dt>
          <dd>{config.apiBaseUrl || t('Sama dengan alamat halaman ini')}</dd>
          {data?.timezone && (
            <>
              <dt>{t('Zona waktu')}</dt>
              <dd>{data.timezone}</dd>
            </>
          )}
        </dl>
      </SurfaceCard>

      <SurfaceCard className={styles.group} aria-labelledby="set-data">
        <div className={styles.groupHead}>
          <h2 id="set-data" className={styles.groupTitle}>
            {t('Data di perangkat ini')}
          </h2>
          <p className={styles.groupDesc}>
            {t('Bahasa, tema, ukuran huruf baca, dan pilihan tampilan disimpan di perangkat ini saja. Materi dan progresmu ada di server dan tidak terhapus.')}
          </p>
        </div>
        <div className={styles.actions}>
          <Button variant="outline" icon="undo" onClick={() => setConfirmReset(true)}>
            {t('Atur ulang preferensi tampilan')}
          </Button>
        </div>
      </SurfaceCard>

      <SurfaceCard className={styles.group} aria-labelledby="set-account">
        <div className={styles.groupHead}>
          <h2 id="set-account" className={styles.groupTitle}>
            {t('Akun')}
          </h2>
          <p className={styles.groupDesc}>{t('Keluar dari sesi di perangkat ini. Datamu tetap aman di server.')}</p>
        </div>
        <div className={styles.actions}>
          <Button variant="outline" icon="log-out" onClick={() => void auth.logout()}>
            {t('Keluar')}
          </Button>
        </div>
      </SurfaceCard>

      <p className={styles.about}>
        Stuby{health.kind === 'ok' ? ` · ${t('Versi server {version}', { version: health.version })}` : ''}
      </p>

      <Dialog
        open={confirmReset}
        onClose={() => setConfirmReset(false)}
        title={t('Atur ulang preferensi tampilan?')}
        description={t('Bahasa kembali ke English, tema ke otomatis, dan pilihan tampilan lain dihapus. Halaman dimuat ulang.')}
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmReset(false)}>
              {t('Batal')}
            </Button>
            <Button variant="danger" onClick={resetLocal}>
              {t('Atur ulang')}
            </Button>
          </>
        }
      >
        <p className={styles.groupDesc}>{t('Materi, kuis, kartu, dan progresmu tidak terpengaruh.')}</p>
      </Dialog>
    </div>
  );
}

function SettingsForm({ settings, onSaved }: { settings: Record<string, string>; onSaved: () => void }) {
  const toast = useToast();
  const { t } = useI18n();
  const [daily, setDaily] = useState(settings.daily_goal_min ?? '');
  const [weekly, setWeekly] = useState(settings.weekly_goal_min ?? '');
  const [style, setStyle] = useState(settings.notes_style ?? 'ringkas');
  const [language, setLanguage] = useState(settings.language ?? 'auto');
  const [saving, setSaving] = useState(false);

  const dailyN = Number(daily);
  const weeklyN = Number(weekly);
  const dailyErr = daily !== '' && (!Number.isFinite(dailyN) || dailyN < 1 || dailyN > 600) ? t('Isi antara 1 dan 600 menit.') : undefined;
  const weeklyErr = weekly !== '' && (!Number.isFinite(weeklyN) || weeklyN < 10 || weeklyN > 3000) ? t('Isi antara 10 dan 3000 menit.') : undefined;

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving || dailyErr || weeklyErr) return;
    setSaving(true);
    try {
      await rpcCall('save_settings', {
        settings: { daily_goal_min: daily, weekly_goal_min: weekly, notes_style: style, language },
      });
      dropCache();
      toast.success(t('Pengaturan disimpan'));
      onSaved();
    } catch (err) {
      toast.error(errorMessage(err, t('Gagal menyimpan pengaturan.')));
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={save} className={styles.group} noValidate>
      <div className={styles.two}>
        <Input label={t('Target harian (menit)')} type="number" inputMode="numeric" min={1} max={600} value={daily} onChange={(e) => setDaily(e.target.value)} error={dailyErr} />
        <Input label={t('Target mingguan (menit)')} type="number" inputMode="numeric" min={10} max={3000} value={weekly} onChange={(e) => setWeekly(e.target.value)} error={weeklyErr} />
      </div>
      <div className={styles.two}>
        <Select label={t('Gaya catatan bawaan')} value={style} onChange={(e) => setStyle(e.target.value)} options={NOTE_STYLES.map((o) => ({ ...o, label: t(o.label) }))} />
        <Select label={t('Bahasa hasil AI')} value={language} onChange={(e) => setLanguage(e.target.value)} options={AI_LANGUAGES.map((o) => ({ ...o, label: t(o.label) }))} />
      </div>
      <div className={styles.actions}>
        <Button type="submit" loading={saving} disabled={Boolean(dailyErr || weeklyErr)}>
          {t('Simpan pengaturan')}
        </Button>
      </div>
    </form>
  );
}
