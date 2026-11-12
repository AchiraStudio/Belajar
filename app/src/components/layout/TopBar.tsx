import React from 'react';
import { Link, useLocation } from 'react-router';
import { useI18n } from '../../services/i18n';
import { useTheme } from '../../services/theme/ThemeContext';
import { Logo } from '../brand/Logo';
import { Icon } from '../ui/Icon';
import { titleForPath } from './navigation';
import { useDesktopWindow, WindowControls } from './windowChrome';
import styles from './TopBar.module.css';

export interface TopBarProps {
  title?: string;
  onSearchClick?: () => void;
  children?: React.ReactNode;
  /** A desktop window narrowed to phone width: just the brand, theme and window buttons. */
  compact?: boolean;
}

/**
 * The one bar across the top of the desktop app. In the desktop (Tauri) window it is also the title
 * bar (there is no system one): empty space drags the window, and minimise / maximise / close sit at
 * the end. In a browser it is a plain top bar. A phone has none: the page owns the whole screen and
 * the dock holds navigation.
 */
export function TopBar({ title, onSearchClick, children, compact = false }: TopBarProps) {
  const location = useLocation();
  const { theme, toggleTheme, resolvedTheme } = useTheme();
  const { t } = useI18n();
  const win = useDesktopWindow();

  const displayTitle = title ?? titleForPath(location.pathname);

  const themeIcon = theme === 'system' ? 'laptop' : resolvedTheme === 'dark' ? 'moon' : 'sun';
  const themeTitle =
    theme === 'system'
      ? t('Tema: Otomatis (Mengikuti Sistem)')
      : theme === 'dark'
        ? t('Tema: Gelap')
        : t('Tema: Terang');

  return (
    <header
      className={styles.topBar}
      data-chrome={win ? '' : undefined}
      data-platform={win?.platform}
      data-compact={compact || undefined}
      aria-label={win ? t('Bilah judul aplikasi') : undefined}
      onMouseDown={win?.onDragMouseDown}
    >
      <Link to="/" className={styles.brand} title={t('Beranda Stuby')}>
        <Logo variant="mark" tile size={compact ? 28 : 36} />
        <span className={styles.brandName}>stuby</span>
      </Link>

      {!compact && <h2 className={styles.pageTitle}>{displayTitle}</h2>}

      {!compact && (
        <button
          type="button"
          onClick={onSearchClick}
          className={styles.searchTrigger}
          aria-label={t('Cari materi atau topik')}
          title={t('Cari (Ctrl+K)')}
        >
          <Icon name="search" size={16} />
          <span>{t('Cari materi atau topik...')}</span>
          <kbd className={styles.kbd}>Ctrl K</kbd>
        </button>
      )}

      <div className={styles.rightSection} data-push={compact || undefined}>
        <button type="button" onClick={toggleTheme} className={styles.roundBtn} aria-label={themeTitle} title={themeTitle}>
          <Icon name={themeIcon} size={17} />
        </button>
        {children}
      </div>

      {win && <WindowControls win={win} />}
    </header>
  );
}
