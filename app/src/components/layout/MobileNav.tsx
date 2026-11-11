import React, { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router';
import { Dialog } from '../ui/Dialog';
import { Icon, type IconName } from '../ui/Icon';
import { FOOTER_ENTRIES, NAV_GROUPS, SECONDARY_ENTRIES, isRouteActive } from './navigation';
import styles from './MobileNav.module.css';

interface MobileNavItem {
  path: string;
  label: string;
  icon: IconName;
}

const MOBILE_ITEMS: MobileNavItem[] = [
  { path: '/', label: 'Beranda', icon: 'home' },
  { path: '/materi', label: 'Materi', icon: 'folder' },
  { path: '/kuis', label: 'Kuis', icon: 'quiz' },
  { path: '/game', label: 'Game', icon: 'game' },
];

export function MobileNav() {
  const location = useLocation();
  const [moreOpen, setMoreOpen] = useState(false);

  // Close the sheet whenever the route changes.
  useEffect(() => {
    setMoreOpen(false);
  }, [location.pathname]);

  const primaryPaths = new Set(MOBILE_ITEMS.map((i) => i.path));
  const moreEntries = [
    ...NAV_GROUPS.flatMap((g) => g.items).filter((e) => !primaryPaths.has(e.path)),
    ...SECONDARY_ENTRIES,
    ...FOOTER_ENTRIES,
  ];
  const moreActive = moreEntries.some((e) => isRouteActive(location.pathname, e.path));

  return (
    <>
      <nav aria-label="Navigasi Bawah Seluler" className={styles.mobileNav}>
        {MOBILE_ITEMS.map((item) => {
          const active = isRouteActive(location.pathname, item.path);
          return (
            <Link
              key={item.path}
              to={item.path}
              aria-current={active ? 'page' : undefined}
              className={`${styles.navItem} ${active ? styles.active : ''}`}
            >
              <Icon name={item.icon} size={20} />
              <span>{item.label}</span>
            </Link>
          );
        })}
        <button
          type="button"
          className={`${styles.navItem} ${styles.moreBtn} ${moreActive ? styles.active : ''}`}
          aria-haspopup="dialog"
          aria-expanded={moreOpen}
          onClick={() => setMoreOpen(true)}
        >
          <Icon name="menu" size={20} />
          <span>Lainnya</span>
        </button>
      </nav>

      <Dialog open={moreOpen} onClose={() => setMoreOpen(false)} title="Menu" size="sm">
        <ul className={styles.moreList}>
          {moreEntries.map((e) => (
            <li key={e.path}>
              <Link to={e.path} className={styles.moreLink} aria-current={isRouteActive(location.pathname, e.path) ? 'page' : undefined}>
                <Icon name={e.icon} size={20} />
                <span>{e.label}</span>
                {e.soon && <span className={styles.soonTag}>Segera</span>}
              </Link>
            </li>
          ))}
        </ul>
      </Dialog>
    </>
  );
}
