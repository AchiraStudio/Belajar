import React from 'react';
import { Icon, ProgressBar, type IconName } from '../../components/ui';
import { useI18n } from '../../services/i18n';
import type { ChecklistId } from './profileModel';
import styles from './Profile.module.css';

const STEPS: Record<ChecklistId, { icon: IconName; title: string; hint: string }> = {
  photo: { icon: 'camera', title: 'Tambah foto profil', hint: 'Biar kamu mudah dikenali' },
  name: { icon: 'user', title: 'Tulis namamu', hint: 'Ganti isian bawaan dengan namamu' },
  bio: { icon: 'edit', title: 'Tulis bio singkat', hint: 'Ceritakan apa yang sedang kamu pelajari' },
  links: { icon: 'link', title: 'Tambah tautan', hint: 'Portofolio, situs, atau profil lain' },
  level: { icon: 'graduation', title: 'Pilih jenjang belajar', hint: 'Menyesuaikan bahasa dan saran' },
};

/**
 * "Finish your profile": one card per step still to do. It is the way to reach every part of the
 * profile in one tap, and it disappears on its own when nothing is left.
 */
export function FinishProfile({ steps, onPick }: { steps: { id: ChecklistId; done: boolean }[]; onPick: (id: ChecklistId) => void }) {
  const { t } = useI18n();
  const left = steps.filter((s) => !s.done);
  if (left.length === 0) return null;
  const done = steps.length - left.length;

  return (
    <section className={styles.finish} aria-labelledby="finish-h">
      <div className={styles.finishHead}>
        <h2 id="finish-h" className={styles.finishTitle}>
          {t('Lengkapi profilmu')}
        </h2>
        <span className={styles.finishCount}>{t('{a} dari {b} selesai', { a: done, b: steps.length })}</span>
      </div>
      <ProgressBar value={(done / steps.length) * 100} label={t('Kelengkapan profil')} />
      <ul className={styles.finishList}>
        {left.map((s) => {
          const meta = STEPS[s.id];
          return (
            <li key={s.id}>
              <button type="button" className={styles.finishCard} onClick={() => onPick(s.id)}>
                <span className={styles.finishIcon} aria-hidden="true">
                  <Icon name={meta.icon} size={18} />
                </span>
                <span className={styles.finishText}>
                  <strong>{t(meta.title)}</strong>
                  <small>{t(meta.hint)}</small>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
