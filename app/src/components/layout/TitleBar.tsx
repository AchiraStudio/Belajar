import React, { useEffect, useState } from 'react';
import { Icon } from '../ui/Icon';
import styles from './TitleBar.module.css';

function detectPlatform(): 'mac' | 'win' | 'linux' {
  if (typeof navigator === 'undefined') return 'win';
  const ua =
    (navigator as any).userAgentData?.platform ||
    navigator.platform ||
    navigator.userAgent ||
    '';
  if (/mac/i.test(ua)) return 'mac';
  if (/win/i.test(ua)) return 'win';
  return 'linux';
}

export function TitleBar() {
  const isTauri =
    typeof window !== 'undefined' &&
    Boolean((window as any).__TAURI__?.window?.getCurrentWindow);

  if (!isTauri) {
    return null;
  }

  return <TauriTitleBarImpl />;
}

function TauriTitleBarImpl() {
  const [isMaximized, setIsMaximized] = useState(false);
  const [platform] = useState<'mac' | 'win' | 'linux'>(() => detectPlatform());

  useEffect(() => {
    try {
      const win = (window as any).__TAURI__?.window?.getCurrentWindow?.();
      if (!win) return;

      win.isMaximized?.().then((max: boolean) => {
        setIsMaximized(Boolean(max));
      }).catch(() => {});

      const unlistenPromise = win.listen?.('tauri://resize', () => {
        win.isMaximized?.().then((max: boolean) => {
          setIsMaximized(Boolean(max));
        }).catch(() => {});
      });

      return () => {
        unlistenPromise?.then((unlisten: any) => {
          if (typeof unlisten === 'function') unlisten();
        }).catch(() => {});
      };
    } catch {
      // Ignore Tauri IPC error
    }
  }, []);

  const getTauriWindow = () => {
    try {
      return (window as any).__TAURI__?.window?.getCurrentWindow?.();
    } catch {
      return null;
    }
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (
      e.button !== 0 ||
      (e.target as HTMLElement).closest('button, a, input, select, textarea')
    ) {
      return;
    }

    const win = getTauriWindow();
    if (!win) return;

    if (e.detail === 2) {
      win.toggleMaximize?.().catch(() => {});
    } else {
      win.startDragging?.().catch(() => {});
    }
  };

  const handleMinimize = () => {
    getTauriWindow()?.minimize?.().catch(() => {});
  };

  const handleToggleMaximize = () => {
    getTauriWindow()?.toggleMaximize?.().catch(() => {});
  };

  const handleClose = () => {
    getTauriWindow()?.close?.().catch(() => {});
  };

  const isMac = platform === 'mac';

  return (
    <header
      role="banner"
      aria-label="Bilah judul aplikasi"
      data-platform={platform}
      className={styles.titleBar}
      onMouseDown={handleMouseDown}
    >
      <div className={styles.brand}>
        <Icon name="book" size={14} color="var(--accent)" />
        <span className={styles.brandName}>Belajar</span>
      </div>

      <div className={styles.dragRegion} />

      <div className={styles.controls}>
        {isMac ? (
          <>
            <button
              type="button"
              className={`${styles.controlBtn} ${styles.closeBtn}`}
              onClick={handleClose}
              title="Tutup"
              aria-label="Tutup"
            />
            <button
              type="button"
              className={`${styles.controlBtn} ${styles.minBtn}`}
              onClick={handleMinimize}
              title="Perkecil"
              aria-label="Perkecil"
            />
            <button
              type="button"
              className={`${styles.controlBtn} ${styles.maxBtn}`}
              onClick={handleToggleMaximize}
              title={isMaximized ? 'Pulihkan' : 'Perbesar'}
              aria-label={isMaximized ? 'Pulihkan' : 'Perbesar'}
            />
          </>
        ) : (
          <>
            <button
              type="button"
              className={`${styles.controlBtn} ${styles.minBtn}`}
              onClick={handleMinimize}
              title="Perkecil"
              aria-label="Perkecil"
            >
              <Icon name="minimize" size={12} />
            </button>
            <button
              type="button"
              className={`${styles.controlBtn} ${styles.maxBtn}`}
              onClick={handleToggleMaximize}
              title={isMaximized ? 'Pulihkan' : 'Perbesar'}
              aria-label={isMaximized ? 'Pulihkan' : 'Perbesar'}
            >
              <Icon name={isMaximized ? 'restore' : 'maximize'} size={12} />
            </button>
            <button
              type="button"
              className={`${styles.controlBtn} ${styles.closeBtn}`}
              onClick={handleClose}
              title="Tutup"
              aria-label="Tutup"
            >
              <Icon name="x" size={12} />
            </button>
          </>
        )}
      </div>
    </header>
  );
}
