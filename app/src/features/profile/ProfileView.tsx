import React, { useCallback, useMemo, useRef, useState } from 'react';
import { ErrorState, Icon, Skeleton, useToast, type IconName } from '../../components/ui';
import { useEnvironment } from '../../services/environment/EnvironmentContext';
import { useI18n } from '../../services/i18n';
import { imageFileToAvatar } from './avatar';
import { EditProfileDialog, type EditFocus } from './EditProfileDialog';
import { FinishProfile } from './FinishProfile';
import { checklist, personalFields, type ChecklistId } from './profileModel';
import { ProfileHero } from './ProfileHero';
import { AboutTab, ActivityTab, LearningTab, PrivacyTab } from './tabs';
import { useProfile, useProfileStats } from './useProfile';
import styles from './Profile.module.css';

type TabId = 'activity' | 'about' | 'learning' | 'privacy';
const TABS: { id: TabId; label: string; icon: IconName }[] = [
  { id: 'activity', label: 'Aktivitas', icon: 'activity' },
  { id: 'about', label: 'Tentang', icon: 'user' },
  { id: 'learning', label: 'Jenjang', icon: 'graduation' },
  { id: 'privacy', label: 'Privasi', icon: 'shield' },
];

/**
 * Profile: a social-style page (cover, photo, name and handle, stats, bio, links) with the study
 * activity, details, learning level and privacy notes under it. Everything shown is the person's own
 * data from the profile API and the `dashboard` answer; there are no follower counts, because the
 * server has no follow feature, and none are invented.
 */
export function ProfileView() {
  const { t } = useI18n();
  const toast = useToast();
  const { environment, info } = useEnvironment();
  const { profile, extras, loading, error, reload, save } = useProfile();
  const stats = useProfileStats();

  const [tab, setTab] = useState<TabId>('activity');
  const [editFocus, setEditFocus] = useState<EditFocus | null>(null);
  const [photoBusy, setPhotoBusy] = useState(false);
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const own = useMemo(() => personalFields(profile), [profile]);
  const displayName = own.name || t('Pelajar');
  const steps = useMemo(() => checklist(profile, extras, environment !== null), [profile, extras, environment]);
  const canEdit = profile !== null;

  const changePhoto = useCallback(
    async (file: File) => {
      setPhotoBusy(true);
      try {
        const avatar = await imageFileToAvatar(file);
        await save({ extras: { ...extras, avatar } });
        toast.success(t('Foto profil diperbarui'));
      } catch (err) {
        toast.error(err instanceof Error ? err.message : t('Gagal menyimpan profil.'));
      } finally {
        setPhotoBusy(false);
      }
    },
    [extras, save, toast, t],
  );

  const onFinish = (id: ChecklistId) => {
    if (id === 'level') {
      setTab('learning');
      tabRefs.current[2]?.focus();
    } else setEditFocus(id);
  };

  const onTabKey = (e: React.KeyboardEvent) => {
    const i = tabRefs.current.findIndex((el) => el === document.activeElement);
    if (i < 0) return;
    let n = -1;
    if (e.key === 'ArrowRight') n = (i + 1) % TABS.length;
    else if (e.key === 'ArrowLeft') n = (i - 1 + TABS.length) % TABS.length;
    else if (e.key === 'Home') n = 0;
    else if (e.key === 'End') n = TABS.length - 1;
    if (n < 0) return;
    e.preventDefault();
    setTab(TABS[n]!.id);
    tabRefs.current[n]?.focus();
  };

  if (loading && !profile) {
    return (
      <div className={styles.page} aria-busy="true" aria-label={t('Memuat profil')}>
        <Skeleton height="176px" borderRadius="24px" />
        <Skeleton width="60%" height="40px" />
        <Skeleton height="72px" borderRadius="16px" />
        <Skeleton height="200px" borderRadius="16px" />
      </div>
    );
  }

  const activeIndex = TABS.findIndex((x) => x.id === tab);

  return (
    <div className={styles.page}>
      {error && !profile && (
        <ErrorState
          title={error.auth ? t('Profil belum bisa dimuat') : t('Gagal memuat profil')}
          message={error.auth ? t('Profil memakai API v1 yang membutuhkan identitas pengguna. Sesi ini belum dikenali oleh API tersebut. Fitur lain tetap berfungsi.') : error.message}
          onRetry={() => void reload()}
        />
      )}

      <ProfileHero
        profile={profile}
        extras={extras}
        displayName={displayName}
        field={[own.major, own.year].filter(Boolean).join(' · ')}
        level={info ? t(info.short) : null}
        stats={{ model: stats.model, loading: stats.loading }}
        canEdit={canEdit}
        photoBusy={photoBusy}
        onEdit={() => setEditFocus('name')}
        onPhoto={(f) => void changePhoto(f)}
      />

      {canEdit && <FinishProfile steps={steps} onPick={onFinish} />}

      <div className={styles.tabsBar}>
        <div className={styles.tabs} role="tablist" aria-label={t('Bagian profil')} onKeyDown={onTabKey} style={{ '--i': activeIndex } as React.CSSProperties}>
          {TABS.map((x, i) => (
            <button
              key={x.id}
              ref={(el) => {
                tabRefs.current[i] = el;
              }}
              type="button"
              role="tab"
              id={`ptab-${x.id}`}
              aria-controls="ppanel"
              aria-selected={tab === x.id}
              tabIndex={tab === x.id ? 0 : -1}
              className={styles.tab}
              onClick={() => setTab(x.id)}
            >
              <Icon name={x.icon} size={18} />
              <span>{t(x.label)}</span>
            </button>
          ))}
          <span className={styles.tabInk} aria-hidden="true" />
        </div>
      </div>

      <div key={tab} id="ppanel" role="tabpanel" aria-labelledby={`ptab-${tab}`} className={styles.panel}>
        {tab === 'activity' && <ActivityTab stats={stats} />}
        {tab === 'about' && <AboutTab profile={profile} level={info ? t(info.short) : null} field={own.major} year={own.year} onEdit={() => setEditFocus('name')} />}
        {tab === 'learning' && <LearningTab />}
        {tab === 'privacy' && <PrivacyTab />}
      </div>

      {profile && <EditProfileDialog open={editFocus !== null} onClose={() => setEditFocus(null)} profile={profile} extras={extras} focus={editFocus ?? 'name'} save={save} />}
    </div>
  );
}
