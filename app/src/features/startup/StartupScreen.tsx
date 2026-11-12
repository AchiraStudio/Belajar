import React from 'react';
import { AnimatedLogo } from '../../components/brand/AnimatedLogo';
import { Button, Icon } from '../../components/ui';
import { useI18n } from '../../services/i18n';
import type { StartupStep, StepId } from './boot';
import styles from './StartupScreen.module.css';

const LABELS: Record<StepId, { active: string; done: string }> = {
  server: { active: 'Menghubungi server', done: 'Server terhubung' },
  session: { active: 'Memeriksa sesi masuk', done: 'Sesi diperiksa' },
  data: { active: 'Memuat data belajarmu', done: 'Data belajarmu siap' },
};

/**
 * The startup screen: the panda chews its bamboo while the app really does what the checklist says.
 * It is an overlay (the app mounts underneath once it is ready) so nothing flashes between states.
 * Text is announced politely; the panda itself is decorative.
 */
export function StartupScreen({
  steps,
  retry,
  error,
  leaving,
  onRetry,
}: {
  steps: StartupStep[];
  retry: { n: number; total: number } | null;
  error: { title: string; message: string } | null;
  leaving: boolean;
  onRetry: () => void;
}) {
  const { t } = useI18n();
  const settled = steps.filter((s) => s.state === 'done' || s.state === 'skipped').length;
  const active = steps.find((s) => s.state === 'active');
  const done = !error && settled === steps.length;
  // "Ready" is shown when the screen starts to lift, i.e. after the panda has finished its intro.
  const ready = done && leaving;
  const progress = Math.round((settled / steps.length) * 100);

  const headline = error
    ? error.title
    : ready
      ? t('Siap!')
      : retry
        ? t('Mencoba lagi ({n}/{total})…', { n: retry.n, total: retry.total })
        : done
          ? t('Hampir siap…')
          : active
            ? t(LABELS[active.id].active) + '…'
            : t('Memulai Stuby…');

  return (
    <div className={`${styles.screen} ${leaving ? styles.leaving : ''}`} role="presentation">
      <div className={styles.stage}>
        <AnimatedLogo state={error ? 'loop' : ready ? 'happy' : 'intro'} size={208} />

        <p className={styles.wordmark} aria-hidden="true">
          {'stuby'.split('').map((ch, i) => (
            <span key={i} style={{ animationDelay: `${520 + i * 70}ms` }}>
              {ch}
            </span>
          ))}
        </p>

        <div className={styles.status} role="status" aria-live="polite">
          <p className={`${styles.headline} ${error ? styles.headlineError : ''}`}>{headline}</p>
          {error && <p className={styles.detail}>{error.message}</p>}
        </div>

        {error ? (
          <Button variant="primary" icon="refresh" onClick={onRetry}>
            {t('Coba Lagi')}
          </Button>
        ) : (
          <>
            <div className={styles.bar} role="progressbar" aria-label={t('Memulai Stuby…')} aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress}>
              <i style={{ width: `${Math.max(progress, active ? 12 : 4)}%` }} />
            </div>
            <ol className={styles.steps}>
              {steps.map((s) => (
                <li key={s.id} className={`${styles.step} ${styles[`step_${s.state}`]}`}>
                  <span className={styles.mark} aria-hidden="true">
                    {s.state === 'done' && <Icon name="check" size={12} />}
                    {s.state === 'error' && <Icon name="x" size={12} />}
                    {s.state === 'active' && <i className={styles.spin} />}
                    {s.state === 'skipped' && <i className={styles.dash} />}
                  </span>
                  <span>
                    {s.state === 'done'
                      ? t(LABELS[s.id].done)
                      : s.state === 'skipped'
                        ? t('Menunggu kamu masuk')
                        : t(LABELS[s.id].active)}
                  </span>
                </li>
              ))}
            </ol>
          </>
        )}
      </div>
    </div>
  );
}
