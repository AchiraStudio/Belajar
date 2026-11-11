import React from 'react';
import { Link, useLocation } from 'react-router';
import { HealthBadge } from '../../features/health/HealthBadge';
import { useTheme } from '../../services/theme/ThemeContext';
import { Icon, type IconName } from '../ui/Icon';
import { SECONDARY_ENTRIES, titleForPath } from './navigation';
import styles from './TopBar.module.css';

export interface TopBarProps {
  title?: string;
  onSearchClick?: () => void;
  children?: React.ReactNode;
}

const ACTION_ICONS: Record<string, IconName> = {
  '/asisten': 'sparkles',
  '/pesan': 'message',
  '/notifikasi': 'bell',
};

export function TopBar({ title, onSearchClick, children }: TopBarProps) {
  const location = useLocation();
  const { theme, toggleTheme, resolvedTheme } = useTheme();

  const displayTitle = title ?? titleForPath(location.pathname);

  const getThemeIcon = () => {
    if (theme === 'system') return 'laptop';
    return resolvedTheme === 'dark' ? 'moon' : 'sun';
  };

  const getThemeTitle = () => {
    if (theme === 'system') return 'Tema: Otomatis (Mengikuti Sistem)';
    return theme === 'dark' ? 'Tema: Gelap' : 'Tema: Terang';
  };

  return (
    <header className={styles.topBar}>
      <div className={styles.leftSection}>
        <h2 className={styles.pageTitle}>{displayTitle}</h2>
      </div>

      <div className={styles.rightSection}>
        <button
          type="button"
          onClick={onSearchClick}
          className={styles.searchTrigger}
          aria-label="Cari materi atau topik"
          title="Cari (Ctrl+K)"
        >
          <Icon name="search" size={16} />
          <span>Cari materi...</span>
          <kbd className={styles.kbd}>Ctrl K</kbd>
        </button>

        <nav className={styles.actions} aria-label="Pintasan">
          {SECONDARY_ENTRIES.filter((e) => ACTION_ICONS[e.path]).map((e) => (
            <Link
              key={e.path}
              to={e.path}
              className={styles.themeBtn}
              aria-label={e.soon ? `${e.label} (belum tersedia)` : e.label}
              title={e.soon ? `${e.label} — segera` : e.label}
            >
              <Icon name={ACTION_ICONS[e.path] as IconName} size={16} />
            </Link>
          ))}
        </nav>

        <HealthBadge />

        <button
          type="button"
          onClick={toggleTheme}
          className={styles.themeBtn}
          aria-label={getThemeTitle()}
          title={getThemeTitle()}
        >
          <Icon name={getThemeIcon()} size={16} />
        </button>

        {children}
      </div>
    </header>
  );
}
