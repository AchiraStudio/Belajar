import React, { useState } from 'react';
import { Link, useLocation } from 'react-router';
import { Icon } from '../ui/Icon';
import { FOOTER_ENTRIES, NAV_GROUPS, isRouteActive, type NavEntry } from './navigation';
import styles from './Sidebar.module.css';

const STORAGE_KEY = 'belajar-sidebar-collapsed';

export function Sidebar() {
  const location = useLocation();
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    try {
      return window.localStorage.getItem(STORAGE_KEY) === 'true';
    } catch {
      return false;
    }
  });

  const toggleCollapsed = () => {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem(STORAGE_KEY, String(next));
      } catch {
        // Ignore storage errors
      }
      return next;
    });
  };

  const renderItem = (item: NavEntry) => {
    const active = isRouteActive(location.pathname, item.path);
    return (
      <Link
        key={item.path}
        to={item.path}
        title={collapsed ? item.label : undefined}
        aria-label={collapsed ? item.label : undefined}
        aria-current={active ? 'page' : undefined}
        className={`${styles.navItem} ${active ? styles.active : ''}`}
      >
        <Icon name={item.icon} size={20} />
        {!collapsed && <span className={styles.navLabel}>{item.label}</span>}
        {!collapsed && item.soon && <span className={styles.soonTag}>Segera</span>}
      </Link>
    );
  };

  return (
    <aside aria-label="Navigasi Utama" className={`${styles.sidebar} ${collapsed ? styles.collapsed : ''}`}>
      <div className={styles.header}>
        <Link to="/" className={styles.brand} title="Beranda Belajar">
          <span className={styles.brandIcon}>
            <Icon name="book" size={18} />
          </span>
          {!collapsed && <span>belajar</span>}
        </Link>
      </div>

      <nav className={styles.navContainer}>
        {NAV_GROUPS.map((group, i) => (
          <div key={group.label ?? `g${i}`} className={styles.group}>
            {group.label && <div className={styles.groupLabel}>{group.label}</div>}
            {group.items.map(renderItem)}
          </div>
        ))}
      </nav>

      <div className={styles.footer}>
        {FOOTER_ENTRIES.map(renderItem)}

        <button
          type="button"
          onClick={toggleCollapsed}
          title={collapsed ? 'Perluas bilah navigasi' : 'Ciutkan bilah navigasi'}
          aria-label={collapsed ? 'Perluas bilah navigasi' : 'Ciutkan bilah navigasi'}
          className={styles.collapseToggle}
        >
          <Icon name={collapsed ? 'chevron-right' : 'chevron-left'} size={18} />
          {!collapsed && <span>Ciutkan</span>}
        </button>
      </div>
    </aside>
  );
}
