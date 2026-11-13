import React from 'react';
import { Button, Dropdown, ErrorState, Icon, Skeleton, SurfaceCard } from '../../components/ui';
import { useI18n } from '../../services/i18n';
import { ENVIRONMENTS, useEnvironment, type EducationEnvironment } from '../../services/environment/EnvironmentContext';
import { useMediaQuery } from '../../hooks/useMediaQuery';
import { ActivityHeatmap } from './ActivityHeatmap';
import { fmtDur } from '../dashboard/utils';
import type { useProfileStats } from './useProfile';
import type { PeerProfile } from './profileModel';
import styles from './Profile.module.css';

type Stats = ReturnType<typeof useProfileStats>;

/* ---------------------------------------------------------------- Activity */

export function ActivityTab({ stats }: { stats: Stats }) {
  const { t } = useI18n();

  if (stats.loading) {
    return (
      <div className={styles.stack} aria-busy="true" aria-label={t('Memuat aktivitas')}>
        <Skeleton height="88px" borderRadius="16px" />
        <Skeleton height="220px" borderRadius="16px" />
      </div>
    );
  }
  if (stats.failed || !stats.data || !stats.model) {
    return <ErrorState title={t('Aktivitas belum bisa dimuat')} message={t('Ringkasan belajar tidak bisa diambil dari server.')} onRetry={() => void stats.reload()} />;
  }

  const m = stats.model;
  const weekGoal = m.weekGoalSeconds ? ` / ${fmtDur(m.weekGoalSeconds)}` : '';
  const facts: { label: string; value: string; hint?: string }[] = [
    { label: t('Total waktu belajar'), value: m.studySeconds > 0 ? fmtDur(m.studySeconds) : '–' },
    { label: t('Minggu ini'), value: `${fmtDur(m.weekSeconds)}${weekGoal}` },
    { label: t('Streak beku'), value: String(m.freezes), hint: m.atRisk ? t('Streakmu hampir putus hari ini') : undefined },
  ];

  return (
    <div className={styles.stack}>
      <dl className={styles.facts}>
        {facts.map((f) => (
          <div key={f.label} className={styles.fact}>
            <dd>{f.value}</dd>
            <dt>{f.label}</dt>
            {f.hint && <small>{f.hint}</small>}
          </div>
        ))}
      </dl>
      <ActivityHeatmap heatmap={stats.data.heatmap ?? []} streakCount={m.streakCount} />
    </div>
  );
}

/* ------------------------------------------------------------------- About */

function Chips({ items, empty }: { items: string[]; empty: string }) {
  if (items.length === 0) return <p className={styles.muted}>{empty}</p>;
  return (
    <ul className={styles.tags}>
      {items.map((x) => (
        <li key={x}>{x}</li>
      ))}
    </ul>
  );
}

export function AboutTab({ profile, level, field, year, onEdit }: { profile: PeerProfile | null; level: string | null; field: string; year: number | null; onEdit: () => void }) {
  const { t } = useI18n();
  const rows: [string, string | null][] = [
    [t('Jenjang belajar'), level],
    [t('Jurusan / bidang'), field || null],
    [t('Tahun angkatan'), year == null ? null : String(year)],
  ];
  const interests = profile?.academic_interests ?? [];
  const skills = profile?.skills ?? [];

  return (
    <div className={styles.about}>
      <SurfaceCard className={styles.card}>
        <h2 className={styles.cardTitle}>{t('Pendidikan')}</h2>
        <dl className={styles.details}>
          {rows.map(([k, v]) => (
            <div key={k}>
              <dt>{k}</dt>
              <dd className={v ? undefined : styles.muted}>{v ?? t('Belum diisi')}</dd>
            </div>
          ))}
        </dl>
      </SurfaceCard>
      <SurfaceCard className={styles.card}>
        <h2 className={styles.cardTitle}>{t('Minat akademik')}</h2>
        <Chips items={interests} empty={t('Belum ada minat. Tambahkan lewat Edit profil.')} />
        <h2 className={styles.cardTitle}>{t('Keahlian')}</h2>
        <Chips items={skills} empty={t('Belum ada keahlian. Tambahkan lewat Edit profil.')} />
        {profile && interests.length === 0 && skills.length === 0 && (
          <div>
            <Button variant="secondary" size="sm" icon="edit" onClick={onEdit}>
              {t('Edit profil')}
            </Button>
          </div>
        )}
      </SurfaceCard>
    </div>
  );
}

/* ---------------------------------------------------------------- Learning */

export function LearningTab() {
  const { t } = useI18n();
  const { environment, setEnvironment, info } = useEnvironment();
  const compact = useMediaQuery('(max-width: 768px)');
  const chosen = ENVIRONMENTS.find((env) => env.id === environment);

  return (
    <SurfaceCard className={styles.card}>
      <h2 className={styles.cardTitle}>{t('Lingkungan belajar')}</h2>
      <p className={styles.cardDesc}>
        {t('Pilih jenjang yang paling sesuai. Kamu bisa mengubahnya kapan saja, dan itu tidak menghapus materi, riwayat belajar, atau lencana.')}
      </p>
      {compact ? (
        <>
          <Dropdown
            aria-label={t('Lingkungan belajar')}
            placeholder={t('Pilih jenjang')}
            value={environment ?? ''}
            onChange={(v) => setEnvironment(v as EducationEnvironment)}
            options={ENVIRONMENTS.map((env) => ({ value: env.id, label: t(env.label), icon: 'graduation' as const }))}
          />
          {chosen && (
            <div className={styles.envSummary}>
              <p className={styles.envDesc}>{t(chosen.description)}</p>
              <ul className={styles.envTunes}>
                {chosen.tunes.map((x) => (
                  <li key={x}>{t(x)}</li>
                ))}
              </ul>
            </div>
          )}
        </>
      ) : (
        <div role="radiogroup" aria-label={t('Lingkungan belajar')} className={styles.envGrid}>
          {ENVIRONMENTS.map((env) => (
            <button key={env.id} type="button" role="radio" aria-checked={environment === env.id} className={styles.env} onClick={() => setEnvironment(env.id as EducationEnvironment)}>
              <span className={styles.envHead}>
                {t(env.label)}
                {environment === env.id && <Icon name="check-circle" size={18} />}
              </span>
              <span className={styles.envDesc}>{t(env.description)}</span>
              <ul className={styles.envTunes}>
                {env.tunes.map((x) => (
                  <li key={x}>{t(x)}</li>
                ))}
              </ul>
            </button>
          ))}
        </div>
      )}
      <div className={styles.note} role="note">
        <Icon name="info" size={16} />
        <span>
          {t('Pilihan ini disimpan di perangkat ini saja.')}{' '}
          {t('Server belum punya kolom jenjang pendidikan, jadi belum dipakai untuk menyesuaikan konten, bahasa AI, atau pembatasan keamanan. Untuk akun anak, perlindungan harus ditegakkan server, bukan sekadar pilihan di layar.')}
        </span>
      </div>
      {info && (
        <div className={styles.actions}>
          <Button variant="ghost" size="sm" onClick={() => setEnvironment(null)}>
            {t('Hapus pilihan')}
          </Button>
        </div>
      )}
    </SurfaceCard>
  );
}

/* ----------------------------------------------------------------- Privacy */

export function PrivacyTab() {
  const { t } = useI18n();
  return (
    <SurfaceCard className={styles.card}>
      <h2 className={styles.cardTitle}>{t('Privasi dan peran')}</h2>
      <ul className={styles.list}>
        <li>
          <strong>{t('Foto, bio, dan tautan tersimpan di profilmu di server.')}</strong>{' '}
          {t('Aplikasi ini belum menampilkannya kepada pengguna lain.')}
        </li>
        <li>
          <strong>{t('Visibilitas per kolom belum tersedia.')}</strong>{' '}
          {t('Server belum menyimpan pengaturan publik / pengikut / grup / privat, jadi profil ini belum dibagikan kepada pengguna lain oleh aplikasi ini. Info kontak tidak ditampilkan atau diubah di sini.')}
        </li>
        <li>
          <strong>{t('Materi, catatan, riwayat kuis, dan percakapan AI')}</strong> {t('bersifat pribadi dan tidak pernah dipakai untuk profil publik.')}
        </li>
        <li>
          <strong>{t('Peran lain (pendidik, wali, moderator)')}</strong>{' '}
          {t('belum ada. Peran harus ditegakkan oleh server, jadi tidak ditampilkan sebagai panel tiruan.')}
        </li>
        <li>
          <strong>{t('Ekspor atau penghapusan akun')}</strong> {t('belum tersedia. Hubungi pemilik server untuk meminta salinan atau penghapusan data.')}
        </li>
      </ul>
    </SurfaceCard>
  );
}
