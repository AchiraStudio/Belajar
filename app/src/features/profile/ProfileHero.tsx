import React, { useRef } from 'react';
import { Link } from 'react-router';
import { Button, Icon } from '../../components/ui';
import { useI18n } from '../../services/i18n';
import type { DashboardModel } from '../dashboard/normalize';
import { initials, linkHost, type PeerProfile, type ProfileExtras } from './profileModel';
import styles from './ProfileHero.module.css';

export interface ProfileHeroProps {
  profile: PeerProfile | null;
  extras: ProfileExtras;
  /** The name to show: the person's own, or a neutral fallback while the server still has its placeholder. */
  displayName: string;
  /** Field of study / year, already filtered of server placeholders. */
  field: string;
  level: string | null;
  stats: { model: DashboardModel | null; loading: boolean };
  /** Editing needs the profile row; without it (not loaded, session unknown) the buttons are disabled. */
  canEdit: boolean;
  photoBusy: boolean;
  onEdit: () => void;
  onPhoto: (file: File) => void;
}

export function ProfileHero({ profile, extras, displayName, field, level, stats, canEdit, photoBusy, onEdit, onPhoto }: ProfileHeroProps) {
  const { t } = useI18n();
  const fileRef = useRef<HTMLInputElement>(null);

  const dash = '–';
  const num = (n: number | null | undefined) => (stats.model && n != null ? String(n) : dash);
  const items: { key: string; value: string; label: string }[] = [
    { key: 'streak', value: num(stats.model?.streakCount), label: t('Hari streak') },
    { key: 'quiz', value: num(stats.model?.attempts), label: t('Kuis selesai') },
    { key: 'docs', value: num(stats.model?.documents), label: t('Materi') },
    { key: 'acc', value: stats.model?.accuracy != null ? `${Math.round(stats.model.accuracy)}%` : dash, label: t('Akurasi rata-rata') },
  ];

  const bio = (profile?.bio ?? '').trim();

  return (
    <header className={styles.hero}>
      <div className={styles.banner} data-tone={extras.banner} aria-hidden="true" />

      <div className={styles.top}>
        <div className={styles.avatarWrap}>
          <span className={styles.avatar} data-busy={photoBusy || undefined}>
            {extras.avatar ? <img src={extras.avatar} alt="" draggable={false} /> : <span aria-hidden="true">{initials(displayName)}</span>}
          </span>
          <button
            type="button"
            className={styles.camera}
            onClick={() => fileRef.current?.click()}
            disabled={!canEdit || photoBusy}
            aria-label={extras.avatar ? t('Ganti foto profil') : t('Tambah foto profil')}
            title={extras.avatar ? t('Ganti foto profil') : t('Tambah foto profil')}
          >
            <Icon name={photoBusy ? 'refresh' : 'camera'} size={16} />
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            hidden
            tabIndex={-1}
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = ''; // picking the same file again must fire a change
              if (file) onPhoto(file);
            }}
          />
        </div>

        <div className={styles.actions}>
          <Button variant="primary" icon="edit" onClick={onEdit} disabled={!canEdit} aria-label={t('Edit profil')}>
            {t('Edit profil')}
          </Button>
          <Link to="/pengaturan" className={styles.iconLink} aria-label={t('Pengaturan')} title={t('Pengaturan')}>
            <Icon name="settings" size={18} />
          </Link>
        </div>
      </div>

      <div className={styles.ident}>
        <h1 className={styles.name}>{displayName}</h1>
        {extras.handle && <p className={styles.handle}>@{extras.handle}</p>}
        {extras.headline && <p className={styles.headline}>{extras.headline}</p>}
      </div>

      <dl className={styles.stats} aria-busy={stats.loading || undefined}>
        {items.map((s) => (
          <div key={s.key} className={styles.stat}>
            <dd className={styles.statValue}>{stats.loading ? <span className={styles.statSkel} aria-hidden="true" /> : s.value}</dd>
            <dt className={styles.statLabel}>{s.label}</dt>
          </div>
        ))}
      </dl>

      {bio ? (
        <p className={styles.bio}>{bio}</p>
      ) : (
        canEdit && (
          <button type="button" className={styles.bioAdd} onClick={onEdit}>
            <Icon name="plus" size={15} /> {t('Tambahkan bio singkat tentang dirimu')}
          </button>
        )
      )}

      {(extras.location || level || field) && (
        <ul className={styles.chips} aria-label={t('Detail profil')}>
          {extras.location && (
            <li>
              <Icon name="map-pin" size={14} /> {extras.location}
            </li>
          )}
          {level && (
            <li>
              <Icon name="graduation" size={14} /> {level}
            </li>
          )}
          {field && (
            <li>
              <Icon name="book" size={14} /> {field}
            </li>
          )}
        </ul>
      )}

      {extras.links.length > 0 && (
        <ul className={styles.links} aria-label={t('Tautan')}>
          {extras.links.map((l) => (
            <li key={l.url}>
              <a href={l.url} target="_blank" rel="noopener noreferrer nofollow ugc" title={linkHost(l.url)}>
                <Icon name="link" size={14} />
                <span>{l.label}</span>
                <Icon name="external-link" size={12} aria-hidden="true" />
              </a>
            </li>
          ))}
        </ul>
      )}
    </header>
  );
}
