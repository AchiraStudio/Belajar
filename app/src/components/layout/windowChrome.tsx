import React, { useEffect, useMemo, useState } from 'react';
import { useI18n } from '../../services/i18n';
import { Icon } from '../ui/Icon';
import styles from './TopBar.module.css';

export type Platform = 'mac' | 'win' | 'linux';

export interface DesktopWindow {
  platform: Platform;
  isMaximized: boolean;
  minimize: () => void;
  toggleMaximize: () => void;
  close: () => void;
  /** Put on the bar: dragging an empty part moves the window, a double click maximises it. */
  onDragMouseDown: (e: React.MouseEvent<HTMLElement>) => void;
}

function detectPlatform(): Platform {
  if (typeof navigator === 'undefined') return 'win';
  const ua = (navigator as any).userAgentData?.platform || navigator.platform || navigator.userAgent || '';
  if (/mac/i.test(ua)) return 'mac';
  if (/win/i.test(ua)) return 'win';
  return 'linux';
}

/** Phones and tablets have no window to drag, minimise or close: the system provides all of that. */
function isMobile(): boolean {
  return typeof navigator !== 'undefined' && /android|iphone|ipad|ipod/i.test(navigator.userAgent || '');
}

function tauriWindow(): any {
  try {
    return (window as any).__TAURI__?.window?.getCurrentWindow?.();
  } catch {
    return null;
  }
}

/**
 * The native window of the desktop app (Tauri), or `null` in a browser and on phones. The window
 * has no system title bar (`decorations: false`), so the top bar is the title bar: it carries the
 * drag area and the minimise / maximise / close buttons.
 */
export function useDesktopWindow(): DesktopWindow | null {
  const present =
    typeof window !== 'undefined' && Boolean((window as any).__TAURI__?.window?.getCurrentWindow) && !isMobile();
  const [isMaximized, setIsMaximized] = useState(false);
  const [platform] = useState<Platform>(() => detectPlatform());

  useEffect(() => {
    if (!present) return;
    try {
      const win = tauriWindow();
      if (!win) return;
      const sync = () =>
        win
          .isMaximized?.()
          .then((max: boolean) => setIsMaximized(Boolean(max)))
          .catch(() => {});
      sync();
      const unlistenPromise = win.listen?.('tauri://resize', sync);
      return () => {
        unlistenPromise?.then((unlisten: any) => typeof unlisten === 'function' && unlisten()).catch(() => {});
      };
    } catch {
      // Tauri IPC unavailable: the bar still renders, the buttons just do nothing.
      return;
    }
  }, [present]);

  return useMemo(() => {
    if (!present) return null;
    return {
      platform,
      isMaximized,
      minimize: () => tauriWindow()?.minimize?.().catch(() => {}),
      toggleMaximize: () => tauriWindow()?.toggleMaximize?.().catch(() => {}),
      close: () => tauriWindow()?.close?.().catch(() => {}),
      onDragMouseDown: (e) => {
        if (e.button !== 0 || (e.target as HTMLElement).closest('button, a, input, select, textarea, [role="combobox"]')) return;
        const win = tauriWindow();
        if (!win) return;
        if (e.detail === 2) win.toggleMaximize?.().catch(() => {});
        else win.startDragging?.().catch(() => {});
      },
    };
  }, [present, platform, isMaximized]);
}

/** Minimise / maximise / close, in the style of the platform. */
export function WindowControls({ win }: { win: DesktopWindow }) {
  const { t } = useI18n();
  const title = win.isMaximized ? t('Pulihkan') : t('Perbesar');

  if (win.platform === 'mac') {
    return (
      <div className={styles.controls} data-platform="mac">
        <button type="button" className={`${styles.controlBtn} ${styles.closeBtn}`} onClick={win.close} title={t('Tutup')} aria-label={t('Tutup')} />
        <button type="button" className={`${styles.controlBtn} ${styles.minBtn}`} onClick={win.minimize} title={t('Perkecil')} aria-label={t('Perkecil')} />
        <button type="button" className={`${styles.controlBtn} ${styles.maxBtn}`} onClick={win.toggleMaximize} title={title} aria-label={title} />
      </div>
    );
  }
  return (
    <div className={styles.controls} data-platform={win.platform}>
      <button type="button" className={styles.controlBtn} onClick={win.minimize} title={t('Perkecil')} aria-label={t('Perkecil')}>
        <Icon name="minimize" size={12} />
      </button>
      <button type="button" className={styles.controlBtn} onClick={win.toggleMaximize} title={title} aria-label={title}>
        <Icon name={win.isMaximized ? 'restore' : 'maximize'} size={12} />
      </button>
      <button type="button" className={`${styles.controlBtn} ${styles.closeBtn}`} onClick={win.close} title={t('Tutup')} aria-label={t('Tutup')}>
        <Icon name="x" size={12} />
      </button>
    </div>
  );
}
