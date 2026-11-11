import React, { useCallback, useEffect, useState } from 'react';
import { Button, ErrorState, Icon, Input, PageHeader, Skeleton, StatusBadge, SurfaceCard, useToast } from '../../components/ui';
import { apiFetch, ApiError } from '../../services/api/client';
import { ENVIRONMENTS, useEnvironment, type EducationEnvironment } from '../../services/environment/EnvironmentContext';
import styles from './Profile.module.css';

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
      setError({ message: err instanceof Error ? err.message : 'Gagal memuat profil.', auth });
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
  const yearErr = yearN !== null && (!Number.isInteger(yearN) || yearN < 1950 || yearN > 2100) ? 'Isi tahun antara 1950 dan 2100.' : undefined;
  const skillErr = skillList.length > MAX_SKILLS ? `Maksimal ${MAX_SKILLS} keahlian.` : undefined;
  const bioErr = bio.length > MAX_BIO ? `Maksimal ${MAX_BIO} karakter.` : undefined;
  const nameErr = name.trim() === '' ? 'Nama wajib diisi.' : undefined;
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
      toast.error(err instanceof Error ? err.message : 'Gagal menyimpan profil.');
    } finally {
      setSaving(false);
    }
  };

  const displayName = (profile?.full_name && profile.full_name !== SERVER_DEFAULT_NAME ? profile.full_name : '') || 'Pelajar';

  return (
    <div className={styles.page}>
      <PageHeader eyebrow="Pertumbuhan" title="Profil" description="Identitas belajarmu, lingkungan belajar, dan data profil yang tersimpan di server." />

      <SurfaceCard className={styles.identity}>
        <span className={styles.avatar} aria-hidden="true">
          {initials(displayName)}
        </span>
        <div className={styles.idText}>
          <h2 className={styles.idName}>{displayName}</h2>
          <div className={styles.idMeta}>
            <StatusBadge status="neutral" label="Peran: Pelajar" />
            {info ? <StatusBadge status="ready" label={info.short} /> : <span>Lingkungan belajar belum dipilih</span>}
            {profile?.major && profile.major.trim() !== '' && <span>{profile.major}</span>}
          </div>
        </div>
      </SurfaceCard>

      <SurfaceCard className={styles.group}>
        <h2 className={styles.groupTitle}>Lingkungan belajar</h2>
        <p className={styles.groupDesc}>
          Pilih jenjang yang paling sesuai. Kamu bisa mengubahnya kapan saja, dan itu tidak menghapus materi, riwayat belajar, atau lencana.
        </p>
        <div role="radiogroup" aria-label="Lingkungan belajar" className={styles.envGrid}>
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
                {env.label}
                {environment === env.id && <Icon name="check-circle" size={18} />}
              </span>
              <span className={styles.envDesc}>{env.description}</span>
              <ul className={styles.envTunes}>
                {env.tunes.map((t) => (
                  <li key={t}>{t}</li>
                ))}
              </ul>
            </button>
          ))}
        </div>
        <div className={styles.note} role="note">
          <Icon name="info" size={16} />
          <span>
            Pilihan ini disimpan <strong>di perangkat ini saja</strong>. Server belum punya kolom jenjang pendidikan, jadi belum dipakai untuk
            menyesuaikan konten, bahasa AI, atau pembatasan keamanan. Untuk akun anak, perlindungan harus ditegakkan server, bukan sekadar pilihan di layar.
          </span>
        </div>
        {environment && (
          <div className={styles.actions}>
            <Button variant="ghost" size="sm" onClick={() => setEnvironment(null)}>
              Hapus pilihan
            </Button>
          </div>
        )}
      </SurfaceCard>

      <SurfaceCard className={styles.group}>
        <h2 className={styles.groupTitle}>Data profil</h2>
        {loading && !profile && <Skeleton height="260px" borderRadius="16px" aria-label="Memuat profil" />}
        {error && !profile && (
          <ErrorState
            title={error.auth ? 'Profil belum bisa dimuat' : 'Gagal memuat profil'}
            message={
              error.auth
                ? 'Profil memakai API v1 yang membutuhkan identitas pengguna. Sesi ini belum dikenali oleh API tersebut. Fitur lain tetap berfungsi.'
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
                <span>Nama dan jurusan masih berupa isian bawaan dari server. Ganti dengan data yang sebenarnya.</span>
              </div>
            )}
            <div className={styles.two}>
              <Input label="Nama lengkap" value={name} onChange={(e) => setName(e.target.value)} error={nameErr} maxLength={120} autoComplete="name" />
              <Input label="Jurusan / bidang" value={major} onChange={(e) => setMajor(e.target.value)} maxLength={120} />
            </div>
            <div className={styles.two}>
              <Input
                label="Tahun angkatan"
                type="number"
                inputMode="numeric"
                value={year}
                onChange={(e) => setYear(e.target.value)}
                error={yearErr}
                hint="Opsional"
              />
            </div>
            <Input label="Bio singkat" multiline rows={4} value={bio} onChange={(e) => setBio(e.target.value)} error={bioErr} hint={`${bio.length}/${MAX_BIO}`} />
            <Input label="Minat akademik" value={interests} onChange={(e) => setInterests(e.target.value)} hint="Pisahkan dengan koma" />
            <Input label="Keahlian" value={skills} onChange={(e) => setSkills(e.target.value)} error={skillErr} hint={`Pisahkan dengan koma (maks ${MAX_SKILLS})`} />
            <div className={styles.actions}>
              <Button type="submit" loading={saving} disabled={invalid}>
                Simpan profil
              </Button>
            </div>
          </form>
        )}
      </SurfaceCard>

      <SurfaceCard className={styles.group}>
        <h2 className={styles.groupTitle}>Privasi dan peran</h2>
        <ul className={styles.list}>
          <li>
            <strong>Visibilitas per kolom belum tersedia.</strong> Server belum menyimpan pengaturan publik / pengikut / grup / privat, jadi profil ini belum
            dibagikan kepada pengguna lain oleh aplikasi ini. Info kontak tidak ditampilkan atau diubah di sini.
          </li>
          <li>
            <strong>Materi, catatan, riwayat kuis, dan percakapan AI</strong> bersifat pribadi dan tidak pernah dipakai untuk profil publik.
          </li>
          <li>
            <strong>Peran lain (pendidik, wali, moderator)</strong> belum ada. Peran harus ditegakkan oleh server, jadi tidak ditampilkan sebagai panel tiruan.
          </li>
          <li>
            <strong>Ekspor atau penghapusan akun</strong> belum tersedia. Hubungi pemilik server untuk meminta salinan atau penghapusan data.
          </li>
        </ul>
      </SurfaceCard>
    </div>
  );
}
