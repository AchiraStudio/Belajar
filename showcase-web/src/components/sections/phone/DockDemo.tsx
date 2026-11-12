import { AnimatePresence, motion } from 'motion/react';
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { DOCK_TABS } from '../../../data/content';
import { EASE_OUT, spring } from '../../../lib/motion';
import { Icon } from '../../ui/Icon';
import styles from './DockDemo.module.css';

const HOLD_MS = 420;

/**
 * The phone dock, as in the app: tap to go, hold a tab and its neighbouring pages rise out of it,
 * slide onto one and release to open it. Keyboard: focus a tab and press the up arrow.
 * This is the page's single glass element (the dock mirrors the app's floating dock).
 */
export function DockDemo() {
  const [selected, setSelected] = useState(0);
  const [menuFor, setMenuFor] = useState(-1);
  const [status, setStatus] = useState('Hold a tab to see more pages.');
  const [menuLeft, setMenuLeft] = useState<number | null>(null);

  const demo = useRef<HTMLDivElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);
  const timer = useRef<number>(0);
  const held = useRef(false);
  const focusFirst = useRef(false);
  const menuForRef = useRef(-1);
  menuForRef.current = menuFor;

  const closeMenu = useCallback((refocus: boolean) => {
    const i = menuForRef.current;
    if (i < 0) return;
    setMenuFor(-1);
    if (refocus) tabs.current[i]?.focus();
  }, []);

  const openMenu = (i: number, withFocus: boolean) => {
    const d = demo.current, t = tabs.current[i];
    if (d && t) {
      const dr = d.getBoundingClientRect(), tr = t.getBoundingClientRect();
      const w = Math.min(260, dr.width * 0.86);
      const center = tr.left + tr.width / 2 - dr.left;
      setMenuLeft(Math.max(w / 2 + 8, Math.min(dr.width - w / 2 - 8, center)));
    }
    focusFirst.current = withFocus;
    setMenuFor(i);
    setStatus(`${DOCK_TABS[i]!.label}: pick a page`);
  };

  useLayoutEffect(() => {
    if (menuFor >= 0 && focusFirst.current) {
      focusFirst.current = false;
      menu.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
    }
  }, [menuFor]);

  const pickItem = (tab: number, k: number) => {
    const item = DOCK_TABS[tab]!.menu[k]!;
    setSelected(tab);
    setStatus(item.soon ? `${item.name}: coming soon, it has no backend yet` : `Opened: ${item.name}`);
    closeMenu(true);
  };

  // A mouse reports the release on whatever is under the pointer, so the release is read from the document.
  const onRelease = useCallback((e: globalThis.PointerEvent) => {
    const over = document.elementFromPoint(e.clientX, e.clientY)?.closest<HTMLElement>('[role="menuitem"]');
    const tab = menuForRef.current;
    if (tab >= 0 && over && menu.current?.contains(over)) pickItem(tab, Number(over.dataset.k));
    window.setTimeout(() => { held.current = false; }, 0); // after the click that follows a release on the tab itself
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onDown = (i: number) => (e: PointerEvent<HTMLButtonElement>) => {
    if (e.button !== 0) return;
    held.current = false;
    window.clearTimeout(timer.current);
    closeMenu(false);
    timer.current = window.setTimeout(() => {
      held.current = true;
      openMenu(i, false);
      document.addEventListener('pointerup', onRelease, { once: true });
    }, HOLD_MS);
  };

  const onTabKey = (i: number) => (e: KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === 'ArrowUp') { e.preventDefault(); openMenu(i, true); }
    else if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      e.preventDefault();
      const n = (i + (e.key === 'ArrowRight' ? 1 : -1) + DOCK_TABS.length) % DOCK_TABS.length;
      closeMenu(false);
      tabs.current[n]?.focus();
      setSelected(n);
      setStatus(`${DOCK_TABS[n]!.label} tab`);
    }
  };

  const onMenuKey = (e: KeyboardEvent) => {
    const items = Array.from(menu.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []);
    const i = items.indexOf(document.activeElement as HTMLElement);
    if (e.key === 'Escape') { e.preventDefault(); closeMenu(true); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); items[(i - 1 + items.length) % items.length]?.focus(); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); items[(i + 1) % items.length]?.focus(); }
  };

  // Tapping anywhere outside the demo dismisses the menu.
  useEffect(() => {
    const onDoc = (e: globalThis.PointerEvent) => {
      if (menuForRef.current >= 0 && !(e.target as HTMLElement).closest('[data-dock-demo]')) closeMenu(false);
    };
    document.addEventListener('pointerdown', onDoc);
    return () => { document.removeEventListener('pointerdown', onDoc); window.clearTimeout(timer.current); };
  }, [closeMenu]);

  const current = menuFor >= 0 ? DOCK_TABS[menuFor]! : null;

  return (
    <div className={styles.demo} ref={demo} data-dock-demo>
      <p className={styles.status} aria-live="polite">{status}</p>

      <AnimatePresence>
        {current && (
          <motion.div
            ref={menu}
            key={menuFor}
            className={styles.menu}
            role="menu"
            aria-label={`${current.label} pages`}
            style={{ left: menuLeft ?? '50%', x: '-50%' }}
            initial={{ opacity: 0, y: 18, scale: 0.92 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.96, transition: { duration: 0.14 } }}
            transition={spring.bouncy}
            onKeyDown={onMenuKey}
          >
            {current.menu.map((item, k) => (
              <motion.button
                key={item.name}
                type="button"
                role="menuitem"
                data-k={k}
                tabIndex={k === 0 ? 0 : -1}
                className={styles.item}
                onClick={() => pickItem(menuFor, k)}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.04 + (current.menu.length - 1 - k) * 0.045, duration: 0.25, ease: EASE_OUT }}
              >
                {item.name}
                {item.soon && <><span className={styles.soon} aria-hidden="true" /><span className="sr-only"> (coming soon)</span></>}
              </motion.button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      <div className={styles.dock} role="tablist" aria-label="Sample phone navigation">
        {DOCK_TABS.map((t, i) => {
          const on = i === selected;
          return (
            <button
              key={t.id}
              ref={(el) => { tabs.current[i] = el; }}
              type="button"
              role="tab"
              aria-selected={on}
              aria-haspopup="menu"
              tabIndex={on ? 0 : -1}
              className={`${styles.tab} ${menuFor === i ? styles.holding : ''}`}
              onPointerDown={onDown(i)}
              onPointerUp={() => window.clearTimeout(timer.current)}
              onPointerCancel={() => { window.clearTimeout(timer.current); held.current = false; }}
              onPointerLeave={(e) => { if (e.pointerType === 'mouse') window.clearTimeout(timer.current); }}
              onContextMenu={(e) => e.preventDefault()}
              onClick={() => {
                if (held.current) { held.current = false; return; } // the hold already opened the menu
                closeMenu(false);
                setSelected(i);
                setStatus(`${t.label} tab`);
              }}
              onKeyDown={onTabKey(i)}
            >
              {on && <motion.span layoutId="dock-pill" className={styles.pill} transition={spring.snappy} />}
              <span className={styles.tabIn}><Icon name={t.icon} size={22} /><span>{t.label}</span></span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
