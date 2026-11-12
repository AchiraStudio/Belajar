import { AnimatePresence, motion, useMotionValueEvent, useScroll } from 'motion/react';
import { useEffect, useState, type MouseEvent } from 'react';
import { NAV, REPO_URL } from '../../data/content';
import { useActiveSection } from '../../hooks/useActiveSection';
import { toggleTheme, useTheme } from '../../hooks/useTheme';
import { EASE_OUT, spring } from '../../lib/motion';
import { Button } from '../ui/Button';
import { Icon } from '../ui/Icon';
import { Brand } from './Brand';
import styles from './Header.module.css';

// 'limits' is watched too (it has no nav link) so "Privacy" stops being highlighted once the page moves past it.
const IDS = [...NAV.map((n) => n.id), 'limits'];

export function Header() {
  const active = useActiveSection(IDS);
  const theme = useTheme();
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const { scrollY } = useScroll();
  useMotionValueEvent(scrollY, 'change', (y) => setScrolled(y > 8));

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    const mq = window.matchMedia('(min-width: 1081px)');
    const onMq = (e: MediaQueryListEvent) => { if (e.matches) setOpen(false); };
    document.addEventListener('keydown', onKey);
    mq.addEventListener('change', onMq);
    return () => { document.removeEventListener('keydown', onKey); mq.removeEventListener('change', onMq); };
  }, []);

  const onTheme = (e: MouseEvent<HTMLButtonElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    toggleTheme({ x: r.left + r.width / 2, y: r.top + r.height / 2 });
  };

  const dark = theme === 'dark';

  return (
    <header className={`${styles.top} ${scrolled ? styles.scrolled : ''}`}>
      <div className={`wrap ${styles.in}`}>
        <Brand />
        <nav className={styles.links} aria-label="Sections">
          {NAV.map((n) => (
            <a key={n.id} href={`#${n.id}`} className={styles.link} aria-current={active === n.id ? 'true' : undefined}>
              {active === n.id && <motion.span layoutId="nav-pill" className={styles.pill} transition={spring.snappy} />}
              <span className={styles.linkText}>{n.label}</span>
            </a>
          ))}
        </nav>
        <div className={styles.actions}>
          <button className={styles.iconBtn} type="button" onClick={onTheme} aria-label={dark ? 'Switch to light theme' : 'Switch to dark theme'}>
            <AnimatePresence mode="wait" initial={false}>
              <motion.span
                key={dark ? 'sun' : 'moon'}
                className={styles.iconSwap}
                initial={{ rotate: -70, scale: 0.4, opacity: 0 }}
                animate={{ rotate: 0, scale: 1, opacity: 1 }}
                exit={{ rotate: 70, scale: 0.4, opacity: 0 }}
                transition={{ duration: 0.22, ease: EASE_OUT }}
              >
                <Icon name={dark ? 'sun' : 'moon'} />
              </motion.span>
            </AnimatePresence>
          </button>
          <Button small variant="ghost" className={styles.gh} href={REPO_URL} target="_blank">Source on GitHub</Button>
          <button
            className={`${styles.iconBtn} ${styles.menuBtn}`}
            type="button"
            aria-expanded={open}
            aria-controls="menu"
            aria-label={open ? 'Close menu' : 'Open menu'}
            onClick={() => setOpen((o) => !o)}
          >
            <Icon name={open ? 'x' : 'menu'} />
          </button>
        </div>
      </div>

      <AnimatePresence initial={false}>
        {open && (
          <motion.nav
            id="menu"
            className={styles.menu}
            aria-label="Sections"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.38, ease: EASE_OUT }}
          >
            <div className={styles.menuIn}>
              {NAV.map((n, i) => (
                <motion.a
                  key={n.id}
                  href={`#${n.id}`}
                  onClick={() => setOpen(false)}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.04 * i + 0.08, duration: 0.3, ease: EASE_OUT }}
                >
                  {n.label}
                </motion.a>
              ))}
              <a href={REPO_URL} target="_blank" rel="noopener" onClick={() => setOpen(false)}>Source on GitHub</a>
            </div>
          </motion.nav>
        )}
      </AnimatePresence>
    </header>
  );
}
