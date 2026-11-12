import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router';
import { useMediaQuery } from '../../hooks/useMediaQuery';
import { useI18n } from '../../services/i18n';
import { Dialog } from '../ui/Dialog';
import { Icon, type IconName } from '../ui/Icon';
import {
  DOCK_LABELS,
  DOCK_SECTIONS,
  FOOTER_ENTRIES,
  MOBILE_TAB_MENUS,
  NAV_GROUPS,
  SECONDARY_ENTRIES,
  entryForPath,
  isRouteActive,
  type NavEntry,
} from './navigation';
import { useAutoHide } from './useAutoHide';
import styles from './Dock.module.css';

interface TabItem {
  path: string;
  label: string;
  icon: IconName;
}

/** Phone tabs. Everything else is one hold (or the "Lainnya" button) away. */
const TABS: TabItem[] = [
  { path: '/', label: 'Beranda', icon: 'home' },
  { path: '/materi', label: 'Materi', icon: 'folder' },
  { path: '/kuis', label: 'Kuis', icon: 'quiz' },
  { path: '/game', label: 'Game', icon: 'game' },
];
const MORE_KEY = 'more';

/** How long a press must last to count as a hold, and how far a finger may drift while it does. */
const HOLD_MS = 340;
const DRIFT_PX = 10;
const MENU_WIDTH = 272;
const MENU_EXIT_MS = 170;
const HINT_KEY = 'stuby-mobilenav-hint-seen';
/** The first two sections get text labels on a wide desktop; the rest are icon-only with tooltips. */
const LABELLED_SECTIONS = 2;

interface OpenMenu {
  key: string;
  label: string;
  /** Horizontal centre of the tab that opened it, so the menu grows out of that tab. */
  anchorX: number;
  closing: boolean;
  /** Opened from the keyboard: focus moves into the menu (a pointer hold leaves focus alone). */
  byKey: boolean;
}

/**
 * The floating dock: the app's only navigation, and the only glass in it.
 *
 * Desktop shows every destination at once (it is complete, nothing hides behind a "more"). A phone
 * shows five tabs; HOLDING a tab lifts that tab's related pages out of it from the bottom up, and with
 * the finger still down you can slide onto an entry and let go to open it. Both hide after a stretch of
 * inactivity and return on scroll, touch, the bottom edge or the keyboard (see useAutoHide).
 */
export function Dock({ onSearch }: { onSearch: () => void }) {
  const location = useLocation();
  const navigate = useNavigate();
  const { t } = useI18n();
  const compact = useMediaQuery('(max-width: 768px)');

  const [moreOpen, setMoreOpen] = useState(false);
  const [menu, setMenu] = useState<OpenMenu | null>(null);
  const [hot, setHot] = useState<string | null>(null);
  const [hint, setHint] = useState(false);
  const [over, setOver] = useState(false);
  const [focused, setFocused] = useState(false);

  const { hidden, reveal } = useAutoHide({ hold: over || focused || menu !== null || moreOpen });

  const hotRef = useRef<string | null>(null);
  const holdTimer = useRef(0);
  const exitTimer = useRef(0);
  const origin = useRef<{ x: number; y: number } | null>(null);
  /** True from the moment a hold opens the menu until the finger lifts. */
  const sliding = useRef(false);
  /** A hold ends in a click on the same tab; it must not also navigate. */
  const swallowClick = useRef(false);
  const triggers = useRef<Record<string, HTMLElement | null>>({});
  const menuRef = useRef<HTMLDivElement>(null);

  const setHotPath = (path: string | null) => {
    hotRef.current = path;
    setHot(path);
  };

  // Close everything whenever the route changes.
  useEffect(() => {
    setMoreOpen(false);
    window.clearTimeout(exitTimer.current);
    setMenu(null);
  }, [location.pathname]);

  useEffect(
    () => () => {
      window.clearTimeout(holdTimer.current);
      window.clearTimeout(exitTimer.current);
    },
    [],
  );

  const openMenu = useCallback((key: string, label: string, byKey = false) => {
    const el = triggers.current[key];
    if (!el) return;
    const rect = el.getBoundingClientRect();
    window.clearTimeout(exitTimer.current);
    hotRef.current = null;
    setHot(null);
    setMenu({ key, label, anchorX: rect.left + rect.width / 2, closing: false, byKey });
  }, []);

  const closeMenu = useCallback((returnFocus = false) => {
    sliding.current = false;
    hotRef.current = null;
    setHot(null);
    setMenu((m) => {
      if (m && returnFocus) triggers.current[m.key]?.focus();
      return m && !m.closing ? { ...m, closing: true } : m;
    });
    window.clearTimeout(exitTimer.current);
    exitTimer.current = window.setTimeout(() => setMenu(null), MENU_EXIT_MS);
  }, []);

  // Escape closes the menu wherever focus is; keyboard-opened menus start on the current page.
  useEffect(() => {
    if (!menu || menu.closing) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        closeMenu(true);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [menu, closeMenu]);

  const keyOpened = menu?.byKey && !menu.closing ? menu.key : null;
  useEffect(() => {
    if (!keyOpened) return;
    const items = Array.from(menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []);
    (items.find((n) => n.getAttribute('aria-current') === 'page') ?? items[0])?.focus();
  }, [keyOpened]);

  // One-time hint that tabs can be held. Phones only, shown once per install.
  useEffect(() => {
    let seen = false;
    try {
      seen = window.localStorage.getItem(HINT_KEY) === '1';
    } catch {
      seen = true; // no storage, so never nag
    }
    if (seen || !compact) return;
    const show = window.setTimeout(() => {
      setHint(true);
      try {
        window.localStorage.setItem(HINT_KEY, '1');
      } catch {
        /* nothing to do */
      }
    }, 1400);
    const hide = window.setTimeout(() => setHint(false), 6400);
    return () => {
      window.clearTimeout(show);
      window.clearTimeout(hide);
    };
  }, [compact]);

  const primaryPaths = new Set(TABS.map((i) => i.path));
  const moreEntries = [
    ...NAV_GROUPS.flatMap((g) => g.items).filter((e) => !primaryPaths.has(e.path)),
    ...SECONDARY_ENTRIES,
    ...FOOTER_ENTRIES,
  ];
  const moreActive = moreEntries.some((e) => isRouteActive(location.pathname, e.path));
  const tabActive = TABS.some((i) => isRouteActive(location.pathname, i.path));

  /** Pointer, keyboard and context-menu handlers that turn a hold on a tab into the menu. */
  const holdHandlers = (key: string, label: string) => {
    const finish = (commit: boolean) => {
      window.clearTimeout(holdTimer.current);
      origin.current = null;
      if (!sliding.current) return;
      sliding.current = false;
      const target = hotRef.current;
      if (commit && target) {
        closeMenu();
        navigate(target);
      }
    };
    return {
      onPointerDown: (e: React.PointerEvent) => {
        if (e.pointerType === 'mouse' && e.button !== 0) return;
        setHint(false);
        swallowClick.current = false;
        origin.current = { x: e.clientX, y: e.clientY };
        window.clearTimeout(holdTimer.current);
        holdTimer.current = window.setTimeout(() => {
          swallowClick.current = true;
          sliding.current = true;
          navigator.vibrate?.(12);
          openMenu(key, label);
        }, HOLD_MS);
      },
      onPointerMove: (e: React.PointerEvent) => {
        const start = origin.current;
        if (!start) return;
        if (!sliding.current) {
          if (Math.hypot(e.clientX - start.x, e.clientY - start.y) > DRIFT_PX) window.clearTimeout(holdTimer.current);
          return;
        }
        // The finger is still down after the hold: highlight whatever entry it is over.
        const hit = document.elementFromPoint(e.clientX, e.clientY)?.closest<HTMLElement>('[data-menu-path]');
        const path = hit?.dataset.menuPath ?? null;
        if (path !== hotRef.current) setHotPath(path);
      },
      onPointerUp: () => finish(true),
      onPointerCancel: () => finish(false),
      // Long-press raises the system menu on Android; ours replaces it.
      onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
      onKeyDown: (e: React.KeyboardEvent) => {
        if (e.key === 'ArrowUp' || e.key === 'ContextMenu' || (e.shiftKey && e.key === 'F10')) {
          e.preventDefault();
          openMenu(key, label, true);
        }
      },
      onClick: (e: React.MouseEvent) => {
        if (swallowClick.current) {
          e.preventDefault();
          e.stopPropagation();
          swallowClick.current = false;
        }
      },
      'aria-haspopup': 'menu' as const,
      'aria-expanded': menu?.key === key && !menu.closing,
      'aria-describedby': 'dock-hold-hint',
    };
  };

  const menuEntries: NavEntry[] = menu
    ? (MOBILE_TAB_MENUS[menu.key] ?? []).map((p) => entryForPath(p)).filter((e): e is NavEntry => Boolean(e))
    : [];

  const viewport = typeof window === 'undefined' ? 390 : window.innerWidth;
  const menuWidth = Math.min(MENU_WIDTH, viewport - 24);
  const menuLeft = menu ? Math.min(Math.max(menu.anchorX - menuWidth / 2, 12), viewport - menuWidth - 12) : 0;
  const caret = menu ? Math.min(Math.max(menu.anchorX - menuLeft, 24), menuWidth - 24) : 0;

  const onMenuKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    const items = Array.from(menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []);
    const at = items.indexOf(document.activeElement as HTMLElement);
    if (at < 0) return;
    e.preventDefault();
    const next = e.key === 'ArrowDown' ? (at + 1) % items.length : (at - 1 + items.length) % items.length;
    items[next]?.focus();
  };

  const link = (entry: NavEntry, labelled: boolean) => {
    const active = isRouteActive(location.pathname, entry.path);
    return (
      <Link
        key={entry.path}
        to={entry.path}
        title={t(entry.label)}
        aria-label={t(entry.label)}
        aria-current={active ? 'page' : undefined}
        className={`${styles.item} ${labelled ? styles.labelled : ''} ${active ? styles.active : ''}`}
      >
        <Icon name={entry.icon} size={20} />
        <span className={labelled ? styles.label : 'sr-only'} aria-hidden={labelled ? true : undefined}>{t(DOCK_LABELS[entry.path] ?? entry.label)}</span>
        {entry.soon && <i className={styles.soonDot} aria-hidden="true" />}
        {entry.soon && <span className="sr-only"> ({t('segera')})</span>}
      </Link>
    );
  };

  return (
    <>
      <span id="dock-hold-hint" className="sr-only">
        {t('Tekan lama, atau tekan panah atas, untuk melihat halaman terkait.')}
      </span>

      {compact && menu && (
        <>
          <div className={`${styles.scrim} ${menu.closing ? styles.scrimOut : ''}`} onClick={() => closeMenu()} aria-hidden="true" />
          <div
            ref={menuRef}
            role="menu"
            aria-label={t('Halaman {name}', { name: t(menu.label) })}
            className={`${styles.holdMenu} ${menu.closing ? styles.holdMenuOut : ''}`}
            style={{ left: menuLeft, width: menuWidth, '--caret': `${caret}px` } as React.CSSProperties}
            onKeyDown={onMenuKeyDown}
          >
            <div className={styles.holdHead}>{t(menu.label)}</div>
            {menuEntries.map((e, i) => {
              const current = isRouteActive(location.pathname, e.path);
              return (
                <Link
                  key={e.path}
                  to={e.path}
                  role="menuitem"
                  data-menu-path={e.path}
                  aria-current={current ? 'page' : undefined}
                  className={`${styles.holdItem} ${current ? styles.holdItemCurrent : ''} ${hot === e.path ? styles.holdItemHot : ''}`}
                  // Items build upward: the one nearest the bar appears first.
                  style={{ '--d': `${(menuEntries.length - 1 - i) * 36 + 40}ms` } as React.CSSProperties}
                  onClick={() => closeMenu()}
                >
                  <span className={styles.holdIcon}>
                    <Icon name={e.icon} size={18} />
                  </span>
                  <span className={styles.holdLabel}>{t(e.label)}</span>
                  {e.soon && <span className={styles.soonTag}>{t('Segera')}</span>}
                  {current && !e.soon && <Icon name="check" size={16} />}
                </Link>
              );
            })}
            <span className={styles.holdCaret} aria-hidden="true" />
          </div>
        </>
      )}

      {compact && hint && !menu && (
        <div className={styles.hint} role="status">
          <Icon name="info" size={16} />
          {t('Tahan sebuah tombol untuk melihat halaman lain')}
        </div>
      )}

      <div
        className={`${styles.wrap} ${hidden ? styles.hidden : ''}`}
        onPointerEnter={(e) => e.pointerType === 'mouse' && setOver(true)}
        onPointerLeave={() => setOver(false)}
        onFocusCapture={() => {
          setFocused(true);
          reveal();
        }}
        onBlurCapture={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setFocused(false);
        }}
      >
        <nav aria-label={t('Navigasi Utama')} className={`${styles.dock} ${compact ? styles.compact : ''}`}>
          {compact ? (
            <>
              {TABS.map((item) => {
                const active = isRouteActive(location.pathname, item.path);
                return (
                  <Link
                    key={item.path}
                    to={item.path}
                    ref={(n) => {
                      triggers.current[item.path] = n;
                    }}
                    aria-current={active ? 'page' : undefined}
                    className={`${styles.item} ${styles.labelled} ${styles.tab} ${active ? styles.active : ''}`}
                    {...holdHandlers(item.path, item.label)}
                  >
                    <Icon name={item.icon} size={22} />
                    <span className={styles.label}>{t(item.label)}</span>
                  </Link>
                );
              })}
              <button
                type="button"
                ref={(n) => {
                  triggers.current[MORE_KEY] = n;
                }}
                className={`${styles.item} ${styles.labelled} ${styles.tab} ${!tabActive && moreActive ? styles.active : ''}`}
                {...holdHandlers(MORE_KEY, 'Lainnya')}
                onClick={(e) => {
                  if (swallowClick.current) {
                    e.preventDefault();
                    swallowClick.current = false;
                    return;
                  }
                  setMoreOpen(true);
                }}
              >
                <Icon name="menu" size={22} />
                <span className={styles.label}>{t('Lainnya')}</span>
              </button>
            </>
          ) : (
            <>
              {DOCK_SECTIONS.map((section, si) => (
                <React.Fragment key={si}>
                  {si > 0 && <span className={styles.sep} aria-hidden="true" />}
                  {si === DOCK_SECTIONS.length - 1 && (
                    <button type="button" className={styles.item} title={`${t('Cari')} (Ctrl+K)`} onClick={onSearch}>
                      <Icon name="search" size={20} />
                      <span className="sr-only">{t('Cari')}</span>
                    </button>
                  )}
                  {section.map((path) => {
                    const entry = entryForPath(path);
                    return entry ? link(entry, si < LABELLED_SECTIONS) : null;
                  })}
                </React.Fragment>
              ))}
            </>
          )}
        </nav>
      </div>

      <button
        type="button"
        className={`${styles.peek} ${hidden ? styles.peekOn : ''}`}
        aria-label={t('Tampilkan navigasi')}
        tabIndex={hidden ? 0 : -1}
        onClick={reveal}
      >
        <span aria-hidden="true" />
      </button>

      <Dialog open={moreOpen} onClose={() => setMoreOpen(false)} title={t('Menu')} size="sm">
        <ul className={styles.moreList}>
          <li>
            <button
              type="button"
              className={styles.moreLink}
              onClick={() => {
                setMoreOpen(false);
                onSearch();
              }}
            >
              <Icon name="search" size={20} />
              <span className={styles.moreText}>{t('Cari')}</span>
            </button>
          </li>
          {moreEntries.map((e) => (
            <li key={e.path}>
              <Link to={e.path} className={styles.moreLink} aria-current={isRouteActive(location.pathname, e.path) ? 'page' : undefined}>
                <Icon name={e.icon} size={20} />
                <span className={styles.moreText}>
                  {t(e.label)}
                  {e.soon && <span className={styles.soonTag}>{t('Segera')}</span>}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </Dialog>
    </>
  );
}
