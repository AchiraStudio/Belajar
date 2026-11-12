import React, { useCallback, useEffect, useState } from 'react';
import { Button, Dropdown, ErrorState, Icon, Input, PageHeader, Skeleton, StatusBadge, SurfaceCard, useToast } from '../../components/ui';
import { useMediaQuery } from '../../hooks/useMediaQuery';
import { apiFetch, ApiError } from '../../services/api/client';
import { ENVIRONMENTS, useEnvironment, type EducationEnvironment } from '../../services/environment/EnvironmentContext';
import styles from './Profile.module.css';
import { tr } from '../../services/i18n';

interface PeerProfile {
  id: number;
  full_name: string;
  major: string;
  batch_year: number | null;
  bio: string | null;
  academic_interests: string[];
  skills: string[];
}

/** Limits enforced by `PUT /api/v1/profiles/me`. */
const MAX_SKILLS = 20;
const MAX_BIO = 2000;
/** Placeholder the server writes when it auto-creates a profile. */
const SERVER_DEFAULT_NAME = 'Mahasiswa Belajar';

const splitList = (s: string) =>
  s
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean);

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? '?') + (parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : '')).toUpperCase();
}

export function ProfileView() {
  const toast = useToast();
  const { environment, setEnvironment, info } = useEnvironment();
  const compact = useMediaQuery('(max-width: 768px)');
  const chosen = ENVIRONMENTS.find((env) => env.id === environment);
  const [profile, setProfile] = useState<PeerProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<{ message: string; auth: boolean } | null>(null);
  const [saving, setSaving] = useState(false);

  const [name, setName] = useState('');
  const [major, setMajor] = useState('');
  const [year, setYear] = useState('');
  const [bio, setBio] = useState('');
  const [interests, setInterests] = useState('');
  const [skills, setSkills] = useState('');

  const hydrate = (p: PeerProfile) => {
    setProfile(p);
    setName(p.full_name);
    setMajor(p.major);
    setYear(p.batch_year == null ? '' : String(p.batch_year));
    setBio(p.bio ?? '');
    setInterests(p.academic_interests.join(', '));
    setSkills(p.skills.join(', '));
  };

  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    try {
      const res = await apiFetch<{ profile: PeerProfile }>('/profiles/me', { signal });
      hydrate(res.profile);
      setError(null);
    } catch (err) {
      if (signal?.aborted) return;
      const auth = err instanceof ApiError && (err.status === 401 || err.status === 403);
      setError({ message: err instanceof Error ? err.message : tr('Gagal memuat profil.'), auth });
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  const skillList = splitList(skills);
  const yearN = year.trim() === '' ? null : Number(year);
  const yearErr = yearN !== null && (!Number.isInteger(yearN) || yearN < 1950 || yearN > 2100) ? tr('Isi tahun antara 1950 dan 2100.') : undefined;
  const skillErr = skillList.length > MAX_SKILLS ? `Maksimal ${MAX_SKILLS} keahlian.` : undefined;
  const bioErr = bio.length > MAX_BIO ? `Maksimal ${MAX_BIO} karakter.` : undefined;
  const nameErr = name.trim() === '' ? tr('Nama wajib diisi.') : undefined;
  const invalid = Boolean(yearErr || skillErr || bioErr || nameErr);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving || invalid) return;
    setSaving(true);
    try {
      const res = await apiFetch<{ profile: PeerProfile }>('/profiles/me', {
        method: 'PUT',
        body: {
          full_name: name.trim(),
          major: major.trim(),
          batch_year: yearN,
          bio,
          academic_interests: splitList(interests),
          skills: skillList,
        },
      });
      hydrate(res.profile);
      toast.success('Profil disimpan');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : tr('Gagal menyimpan profil.'));
    } finally {
      setSaving(false);
    }
  };

  const displayName = (profile?.full_name && profile.full_name !== SERVER_DEFAULT_NAME ? profile.full_name : '') || 'Pelajar';

  return (
    <div className={styles.page}>
      <PageHeader eyebrow={tr('Pertumbuhan')} title={tr('Profil')} description={tr('Identitas belajarmu, lingkungan belajar, dan data profil yang tersimpan di server.')} />

      <SurfaceCard className={styles.identity}>
        <span className={styles.avatar} aria-hidden="true">
          {initials(displayName)}
        </span>
        <div className={styles.idText}>
          <h2 className={styles.idName}>{displayName}</h2>
          <div className={styles.idMeta}>
            <StatusBadge status="neutral" label={tr('Peran: Pelajar')} />
            {info ? <StatusBadge status="ready" label={tr(info.short)} /> : <span>{tr('Lingkungan belajar belum dipilih')}</span>}
            {profile?.major && profile.major.trim() !== '' && <span>{profile.major}</span>}
          </div>
        </div>
      </SurfaceCard>

      <SurfaceCard className={styles.group}>
        <h2 className={styles.groupTitle}>{tr('Lingkungan belajar')}</h2>
        <p className={styles.groupDesc}>
          {tr('Pilih jenjang yang paling sesuai. Kamu bisa mengubahnya kapan saja, dan itu tidak menghapus materi, riwayat belajar, atau lencana.')}
        </p>
        {compact ? (
          <>
            <Dropdown
              aria-label={tr('Lingkungan belajar')}
              placeholder={tr('Pilih jenjang')}
              value={environment ?? ''}
              onChange={(v) => setEnvironment(v as EducationEnvironment)}
              options={ENVIRONMENTS.map((env) => ({ value: env.id, label: tr(env.label), icon: 'graduation' as const }))}
            />
            {chosen && (
              <div className={styles.envSummary}>
                <p className={styles.envDesc}>{tr(chosen.description)}</p>
                <ul className={styles.envTunes}>
                  {chosen.tunes.map((t) => (
                    <li key={t}>{tr(t)}</li>
                  ))}
                </ul>
              </div>
            )}
          </>
        ) : (
        <div role="radiogroup" aria-label={tr('Lingkungan belajar')} className={styles.envGrid}>
          {ENVIRONMENTS.map((env) => (
            <button
              key={env.id}
              type="button"
              role="radio"
              aria-checked={environment === env.id}
              className={styles.env}
              onClick={() => setEnvironment(env.id as EducationEnvironment)}
            >
              <span className={styles.envHead}>
                {tr(env.label)}
                {environment === env.id && <Icon name="check-circle" size={18} />}
              </span>
              <span className={styles.envDesc}>{tr(env.description)}</span>
              <ul className={styles.envTunes}>
                {env.tunes.map((t) => (
                  <li key={t}>{tr(t)}</li>
                ))}
              </ul>
            </button>
          ))}
        </div>
        )}
        <div className={styles.note} role="note">
          <Icon name="info" size={16} />
          <span>
            {tr('Pilihan ini disimpan di perangkat ini saja.')}{' '}{tr('Server belum punya kolom jenjang pendidikan, jadi belum dipakai untuk menyesuaikan konten, bahasa AI, atau pembatasan keamanan. Untuk akun anak, perlindungan harus ditegakkan server, bukan sekadar pilihan di layar.')}
          </span>
        </div>
        {environment && (
          <div className={styles.actions}>
            <Button variant="ghost" size="sm" onClick={() => setEnvironment(null)}>
              {tr('Hapus pilihan')}
            </Button>
          </div>
        )}
      </SurfaceCard>

      <SurfaceCard className={styles.group}>
        <h2 className={styles.groupTitle}>{tr('Data profil')}</h2>
        {loading && !profile && <Skeleton height="260px" borderRadius="16px" aria-label={tr('Memuat profil')} />}
        {error && !profile && (
          <ErrorState
            title={error.auth ? tr('Profil belum bisa dimuat') : tr('Gagal memuat profil')}
            message={
              error.auth
                ? tr('Profil memakai API v1 yang membutuhkan identitas pengguna. Sesi ini belum dikenali oleh API tersebut. Fitur lain tetap berfungsi.')
                : error.message
            }
            onRetry={() => void load()}
          />
        )}
        {profile && (
          <form onSubmit={save} className={styles.group} noValidate>
            {profile.full_name === SERVER_DEFAULT_NAME && (
              <div className={`${styles.note} ${styles.warn}`} role="note">
                <Icon name="alert-triangle" size={16} />
                <span>{tr('Nama dan jurusan masih berupa isian bawaan dari server. Ganti dengan data yang sebenarnya.')}</span>
              </div>
            )}
            <div className={styles.two}>
              <Input label={tr('Nama lengkap')} value={name} onChange={(e) => setName(e.target.value)} error={nameErr} maxLength={120} autoComplete="name" />
              <Input label={tr('Jurusan / bidang')} value={major} onChange={(e) => setMajor(e.target.value)} maxLength={120} />
            </div>
            <div className={styles.two}>
              <Input
                label={tr('Tahun angkatan')}
                type="number"
                inputMode="numeric"
                value={year}
                onChange={(e) => setYear(e.target.value)}
                error={yearErr}
                hint={tr('Opsional')}
              />
            </div>
            <Input label={tr('Bio singkat')} multiline rows={4} value={bio} onChange={(e) => setBio(e.target.value)} error={bioErr} hint={`${bio.length}/${MAX_BIO}`} />
            <Input label={tr('Minat akademik')} value={interests} onChange={(e) => setInterests(e.target.value)} hint={tr('Pisahkan dengan koma')} />
            <Input label={tr('Keahlian')} value={skills} onChange={(e) => setSkills(e.target.value)} error={skillErr} hint={tr('Pisahkan dengan koma (maks {a})', { a: MAX_SKILLS })} />
            <div className={styles.actions}>
              <Button type="submit" loading={saving} disabled={invalid}>
                {tr('Simpan profil')}
              </Button>
            </div>
          </form>
        )}
      </SurfaceCard>

      <SurfaceCard className={styles.group}>
        <h2 className={styles.groupTitle}>{tr('Privasi dan peran')}</h2>
        <ul className={styles.list}>
          <li>
            <strong>{tr('Visibilitas per kolom belum tersedia.')}</strong>{' '}{tr('Server belum menyimpan pengaturan publik / pengikut / grup / privat, jadi profil ini belum dibagikan kepada pengguna lain oleh aplikasi ini. Info kontak tidak ditampilkan atau diubah di sini.')}
          </li>
          <li>
            <strong>{tr('Materi, catatan, riwayat kuis, dan percakapan AI')}</strong>{' '}{tr('bersifat pribadi dan tidak pernah dipakai untuk profil publik.')}
          </li>
          <li>
            <strong>{tr('Peran lain (pendidik, wali, moderator)')}</strong>{' '}{tr('belum ada. Peran harus ditegakkan oleh server, jadi tidak ditampilkan sebagai panel tiruan.')}
          </li>
          <li>
            <strong>{tr('Ekspor atau penghapusan akun')}</strong>{' '}{tr('belum tersedia. Hubungi pemilik server untuk meminta salinan atau penghapusan data.')}
          </li>
        </ul>
      </SurfaceCard>
    </div>
  );
}
