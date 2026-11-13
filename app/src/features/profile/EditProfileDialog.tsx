import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Button, Dialog, Icon, Input, useToast } from '../../components/ui';
import { useI18n } from '../../services/i18n';
import { imageFileToAvatar } from './avatar';
import {
  BANNER_TONES,
  LIMITS,
  handleError,
  initials,
  normalizeHandle,
  personalFields,
  safeHttpUrl,
  splitList,
  type BannerTone,
  type PeerProfile,
  type ProfileExtras,
} from './profileModel';
import type { ProfileSave } from './useProfile';
import styles from './EditProfile.module.css';

export type EditFocus = 'name' | 'bio' | 'links' | 'photo';

interface LinkRow {
  key: number;
  label: string;
  url: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  profile: PeerProfile;
  extras: ProfileExtras;
  /** Which part to put the cursor in first (the "finish your profile" cards open it on the right field). */
  focus?: EditFocus;
  save: (patch: ProfileSave) => Promise<PeerProfile>;
}

const TONE_LABEL: Record<BannerTone, string> = {
  bamboo: 'Bambu',
  sun: 'Matahari',
  leaf: 'Daun',
  cream: 'Krem',
  ink: 'Tinta',
};

let rowKey = 0;
const newRow = (label = '', url = ''): LinkRow => ({ key: ++rowKey, label, url });

export function EditProfileDialog({ open, onClose, profile, extras, focus = 'name', save }: Props) {
  const { t } = useI18n();
  const toast = useToast();
  const photoInput = useRef<HTMLInputElement>(null);

  const [name, setName] = useState('');
  const [handle, setHandle] = useState('');
  const [headline, setHeadline] = useState('');
  const [bio, setBio] = useState('');
  const [location, setLocation] = useState('');
  const [major, setMajor] = useState('');
  const [year, setYear] = useState('');
  const [interests, setInterests] = useState('');
  const [skills, setSkills] = useState('');
  const [banner, setBanner] = useState<BannerTone>('bamboo');
  const [avatar, setAvatar] = useState<string | null>(null);
  const [links, setLinks] = useState<LinkRow[]>([]);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [touched, setTouched] = useState(false);

  // Start from what is stored each time the dialog opens, so a cancelled edit leaves no trace.
  useEffect(() => {
    if (!open) return;
    const own = personalFields(profile);
    setName(own.name);
    setMajor(own.major);
    setYear(own.year == null ? '' : String(own.year));
    setHandle(extras.handle);
    setHeadline(extras.headline);
    setLocation(extras.location);
    setBanner(extras.banner);
    setAvatar(extras.avatar);
    setLinks(extras.links.map((l) => newRow(l.label, l.url)));
    setBio(profile.bio ?? '');
    setInterests(profile.academic_interests.join(', '));
    setSkills(profile.skills.join(', '));
    setTouched(false);
    setPhotoBusy(false);
  }, [open, profile, extras]);

  const yearN = year.trim() === '' ? null : Number(year);
  const skillList = splitList(skills);
  const errors = useMemo(() => {
    const linkErrors = links.map((l) => {
      if (l.url.trim() === '' && l.label.trim() === '') return undefined;
      if (l.url.trim() === '' || safeHttpUrl(l.url) === null) return t('Tulis alamat yang valid, misalnya github.com/namamu.');
      return undefined;
    });
    return {
      name: name.trim() === '' ? t('Nama wajib diisi.') : undefined,
      handle: handleError(handle) ? t('Nama pengguna minimal {n} karakter.', { n: LIMITS.handleMin }) : undefined,
      year: yearN !== null && (!Number.isInteger(yearN) || yearN < 1950 || yearN > 2100) ? t('Isi tahun antara 1950 dan 2100.') : undefined,
      skills: skillList.length > LIMITS.skills ? t('Maksimal {n} keahlian.', { n: LIMITS.skills }) : undefined,
      bio: bio.length > LIMITS.bio ? t('Maksimal {n} karakter.', { n: LIMITS.bio }) : undefined,
      links: linkErrors,
    };
  }, [name, handle, yearN, skillList.length, bio, links, t]);
  const invalid = Boolean(errors.name || errors.handle || errors.year || errors.skills || errors.bio || errors.links.some(Boolean));

  const pickPhoto = async (file: File) => {
    setPhotoBusy(true);
    try {
      setAvatar(await imageFileToAvatar(file));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('Gagal memproses gambar.'));
    } finally {
      setPhotoBusy(false);
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (saving || invalid || photoBusy) return;
    setSaving(true);
    try {
      const cleanLinks = links.flatMap((l) => {
        const url = safeHttpUrl(l.url);
        return url ? [{ label: l.label.trim() || new URL(url).hostname.replace(/^www\./, ''), url }] : [];
      });
      await save({
        full_name: name.trim(),
        major: major.trim(),
        batch_year: yearN,
        bio: bio.trim(),
        academic_interests: splitList(interests),
        skills: skillList,
        extras: { handle, headline: headline.trim(), location: location.trim(), banner, avatar, links: cleanLinks },
      });
      toast.success(t('Profil disimpan'));
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('Gagal menyimpan profil.'));
    } finally {
      setSaving(false);
    }
  };

  const show = (msg: string | undefined) => (touched ? msg : undefined);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      size="lg"
      dismissible={!saving}
      title={t('Edit profil')}
      description={t('Ini yang tampil di halaman profilmu. Kamu bisa mengubahnya kapan saja.')}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            {t('Batal')}
          </Button>
          <Button type="submit" form="edit-profile-form" loading={saving} disabled={photoBusy || (touched && invalid)}>
            {t('Simpan profil')}
          </Button>
        </>
      }
    >
      <form id="edit-profile-form" className={styles.form} onSubmit={submit} noValidate>
        {/* ---- Photo and cover ---- */}
        <section className={styles.photoRow} aria-label={t('Foto dan sampul')}>
          <span className={styles.preview} aria-hidden="true">
            {avatar ? <img src={avatar} alt="" /> : <span>{initials(name || t('Pelajar'))}</span>}
          </span>
          <div className={styles.photoActions}>
            <div className={styles.btnRow}>
              <Button type="button" variant="secondary" size="sm" icon="camera" loading={photoBusy} onClick={() => photoInput.current?.click()} data-autofocus={focus === 'photo' ? '' : undefined}>
                {avatar ? t('Ganti foto') : t('Unggah foto')}
              </Button>
              {avatar && (
                <Button type="button" variant="ghost" size="sm" icon="trash" onClick={() => setAvatar(null)} disabled={photoBusy}>
                  {t('Hapus foto')}
                </Button>
              )}
            </div>
            <p className={styles.help}>{t('Fotomu dipotong persegi dan dikecilkan otomatis.')}</p>
            <input
              ref={photoInput}
              type="file"
              accept="image/*"
              hidden
              tabIndex={-1}
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = '';
                if (file) void pickPhoto(file);
              }}
            />
          </div>
        </section>

        <div className={styles.group} role="radiogroup" aria-label={t('Warna sampul')}>
          <span className={styles.groupLabel}>{t('Warna sampul')}</span>
          <div className={styles.swatches}>
            {BANNER_TONES.map((tone) => (
              <button
                key={tone}
                type="button"
                role="radio"
                aria-checked={banner === tone}
                aria-label={t(TONE_LABEL[tone])}
                title={t(TONE_LABEL[tone])}
                data-tone={tone}
                className={styles.swatch}
                onClick={() => setBanner(tone)}
              >
                {banner === tone && <Icon name="check" size={16} />}
              </button>
            ))}
          </div>
        </div>

        {/* ---- Who you are ---- */}
        <div className={styles.two}>
          <Input
            label={t('Nama lengkap')}
            value={name}
            onChange={(e) => setName(e.target.value)}
            error={show(errors.name)}
            maxLength={LIMITS.name}
            autoComplete="name"
            data-autofocus={focus === 'name' ? '' : undefined}
          />
          <Input
            label={t('Nama pengguna')}
            value={handle ? `@${handle}` : ''}
            onChange={(e) => setHandle(normalizeHandle(e.target.value))}
            error={show(errors.handle)}
            hint={t('Huruf kecil, angka, titik, atau garis bawah')}
            placeholder={t('@namamu')}
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
          />
        </div>
        <Input label={t('Tagline')} value={headline} onChange={(e) => setHeadline(e.target.value)} maxLength={LIMITS.headline} hint={`${headline.length}/${LIMITS.headline}`} />
        <Input
          label={t('Bio singkat')}
          multiline
          rows={4}
          value={bio}
          onChange={(e) => setBio(e.target.value)}
          error={show(errors.bio)}
          hint={`${bio.length}/${LIMITS.bio}`}
          data-autofocus={focus === 'bio' ? '' : undefined}
        />

        {/* ---- Details ---- */}
        <div className={styles.two}>
          <Input label={t('Lokasi')} value={location} onChange={(e) => setLocation(e.target.value)} maxLength={LIMITS.location} icon="map-pin" hint={t('Opsional')} />
          <Input label={t('Jurusan / bidang')} value={major} onChange={(e) => setMajor(e.target.value)} maxLength={LIMITS.field} />
        </div>
        <div className={styles.two}>
          <Input label={t('Tahun angkatan')} type="number" inputMode="numeric" value={year} onChange={(e) => setYear(e.target.value)} error={show(errors.year)} hint={t('Opsional')} />
        </div>
        <Input label={t('Minat akademik')} value={interests} onChange={(e) => setInterests(e.target.value)} hint={t('Pisahkan dengan koma')} />
        <Input label={t('Keahlian')} value={skills} onChange={(e) => setSkills(e.target.value)} error={show(errors.skills)} hint={t('Pisahkan dengan koma (maks {a})', { a: LIMITS.skills })} />

        {/* ---- Links ---- */}
        <fieldset className={styles.links}>
          <legend className={styles.groupLabel}>{t('Tautan')}</legend>
          <p className={styles.help}>{t('Situs, portofolio, atau profil di tempat lain. Maksimal {n}.', { n: LIMITS.links })}</p>
          {links.map((l, i) => (
            <div key={l.key} className={styles.linkRow}>
              <Input
                aria-label={t('Nama tautan {n}', { n: i + 1 })}
                placeholder={t('Nama, misalnya GitHub')}
                value={l.label}
                maxLength={LIMITS.linkLabel}
                onChange={(e) => setLinks((rows) => rows.map((r) => (r.key === l.key ? { ...r, label: e.target.value } : r)))}
              />
              <Input
                aria-label={t('Alamat tautan {n}', { n: i + 1 })}
                placeholder={t('github.com/namamu')}
                value={l.url}
                inputMode="url"
                autoCapitalize="none"
                spellCheck={false}
                error={show(errors.links[i])}
                data-autofocus={focus === 'links' && i === 0 ? '' : undefined}
                onChange={(e) => setLinks((rows) => rows.map((r) => (r.key === l.key ? { ...r, url: e.target.value } : r)))}
              />
              <Button type="button" variant="ghost" size="sm" icon="trash" aria-label={t('Hapus tautan {n}', { n: i + 1 })} onClick={() => setLinks((rows) => rows.filter((r) => r.key !== l.key))} />
            </div>
          ))}
          {links.length < LIMITS.links && (
            <Button type="button" variant="secondary" size="sm" icon="plus" onClick={() => setLinks((rows) => [...rows, newRow()])} data-autofocus={focus === 'links' && links.length === 0 ? '' : undefined}>
              {t('Tambah tautan')}
            </Button>
          )}
        </fieldset>
      </form>
    </Dialog>
  );
}
