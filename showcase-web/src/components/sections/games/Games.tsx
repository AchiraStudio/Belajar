import { motion, useMotionValue, useReducedMotion, useSpring } from 'motion/react';
import { useCallback, useEffect, useRef, useState, type PointerEvent, type ReactNode } from 'react';
import { EASE_OUT } from '../../../lib/motion';
import { Icon } from '../../ui/Icon';
import { SectionHead } from '../../ui/SectionHead';
import styles from './Games.module.css';
import { SpotGame } from './SpotGame';

interface GameCard { n: number; title: string; tone: string; body: string; extra?: ReactNode; id?: string }

const CARDS: GameCard[] = [
  {
    n: 1, title: 'Teach-back', tone: 'leaf',
    body: 'Explain the concept in your own words. An AI student asks pointed questions, then scores your explanation against a rubric.',
    extra: <div className={styles.bubble}><b>AI student</b>Wait, why does the cold side matter at all?</div>,
  },
  { n: 2, title: 'Spot the error', tone: 'spot', body: 'One or two sentences in a convincing explanation are wrong. Find them.', extra: <SpotGame /> },
  {
    n: 3, title: 'Branching adventure', tone: 'sun',
    body: 'A story that forks, with three lives. Each obstacle is a challenge taken from your material.',
    extra: (
      <div className={styles.lives} role="img" aria-label="Three lives">
        {[0, 1, 2].map((i) => (
          <motion.i
            key={i}
            initial={{ scale: 0 }}
            whileInView={{ scale: 1 }}
            viewport={{ once: true }}
            transition={{ type: 'spring', stiffness: 420, damping: 16, delay: 0.3 + i * 0.1 }}
          />
        ))}
      </div>
    ),
  },
  { n: 4, title: 'Real-world case', tone: 'cream', body: 'Choose what to do in a realistic scenario, then explain why you chose it.' },
  { n: 5, title: 'Rapid-fire', tone: 'ink', body: 'Quick questions you can answer one-handed. Fits in five to ten minutes.' },
  { n: 6, title: 'Boss exam', tone: 'boss', body: 'A cross-topic exam with no hints and no feedback until the very end, closed with a report card.' },
];

export function Games() {
  const deck = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();
  const [pos, setPos] = useState({ i: 0, atStart: true, atEnd: false });
  const progress = useMotionValue(0);
  const bar = useSpring(progress, { stiffness: 200, damping: 30 });

  const cards = () => Array.from(deck.current?.querySelectorAll<HTMLElement>('[data-g]') ?? []);
  const padL = () => parseFloat(getComputedStyle(deck.current!).paddingLeft) || 0;

  const sync = useCallback(() => {
    const d = deck.current;
    if (!d) return;
    const max = d.scrollWidth - d.clientWidth;
    const atEnd = d.scrollLeft >= max - 4;
    const list = cards();
    let best = 0, bd = Infinity;
    const x = d.scrollLeft + padL() + 4;
    list.forEach((c, i) => { const dist = Math.abs(c.offsetLeft - x); if (dist < bd) { bd = dist; best = i; } });
    progress.set(max > 0 ? d.scrollLeft / max : 0);
    setPos({ i: atEnd ? list.length - 1 : best, atStart: d.scrollLeft <= 2, atEnd });
  }, [progress]);

  useEffect(() => { sync(); window.addEventListener('resize', sync); return () => window.removeEventListener('resize', sync); }, [sync]);

  const goTo = (i: number) => {
    const list = cards();
    const t = Math.max(0, Math.min(list.length - 1, i));
    deck.current?.scrollTo({ left: list[t]!.offsetLeft - padL(), behavior: reduce ? 'auto' : 'smooth' });
  };

  // Drag to scroll with a mouse. Touch and trackpads already scroll natively, so they are left alone.
  const drag = useRef({ on: false, x: 0, left: 0, moved: false });
  const onDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.pointerType !== 'mouse' || e.button !== 0 || (e.target as HTMLElement).closest('button, input, a')) return;
    drag.current = { on: true, x: e.clientX, left: deck.current!.scrollLeft, moved: false };
  };
  const onMove = (e: PointerEvent<HTMLDivElement>) => {
    const s = drag.current;
    if (!s.on) return;
    const dx = e.clientX - s.x;
    if (Math.abs(dx) > 4 && !s.moved) { s.moved = true; deck.current!.setPointerCapture(e.pointerId); deck.current!.dataset.drag = 'true'; }
    if (s.moved) deck.current!.scrollLeft = s.left - dx;
  };
  const onUp = () => {
    const s = drag.current;
    if (!s.on) return;
    s.on = false;
    if (s.moved) { delete deck.current!.dataset.drag; goTo(pos.i); }
  };

  return (
    <section className={styles.play} id="play" aria-labelledby="h-play">
      <div className="wrap">
        <SectionHead
          split
          onDark
          kicker="Games"
          id="h-play"
          title="Six ways to be quizzed without it feeling like one."
          sub="Every game is generated from your material. The server is the referee: answer keys never reach your browser before a turn is judged, and AI output is treated as untrusted."
        />
      </div>

      <div
        className={styles.deck}
        ref={deck}
        tabIndex={0}
        role="region"
        aria-label="Game modes, scroll sideways"
        onScroll={() => requestAnimationFrame(sync)}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        onKeyDown={(e) => {
          if (e.target !== e.currentTarget) return;
          if (e.key === 'ArrowRight') { e.preventDefault(); goTo(pos.i + 1); }
          if (e.key === 'ArrowLeft') { e.preventDefault(); goTo(pos.i - 1); }
        }}
      >
        {CARDS.map((c, i) => (
          <motion.article
            key={c.n}
            data-g
            className={`${styles.g} ${styles[`g-${c.tone}`]}`}
            initial={{ opacity: 0, y: 40, rotate: 1.5 }}
            whileInView={{ opacity: 1, y: 0, rotate: 0 }}
            viewport={{ once: true, margin: '0px -4% 0px 0px' }}
            transition={{ duration: 0.7, delay: Math.min(i, 3) * 0.08, ease: EASE_OUT }}
          >
            <span className={styles.gn}>{c.n}</span>
            <h3>{c.title}</h3>
            <p>{c.body}</p>
            {c.extra}
          </motion.article>
        ))}
      </div>

      <div className={styles.ctl}>
        <button className={styles.arrow} type="button" onClick={() => goTo(pos.i - 1)} disabled={pos.atStart} aria-label="Previous game" aria-controls="deck">
          <Icon name="chevL" />
        </button>
        <div className={styles.track} aria-hidden="true"><motion.span className={styles.thumb} style={{ scaleX: bar }} /></div>
        <span className={styles.pos} aria-live="polite">{pos.i + 1} of {CARDS.length}</span>
        <button className={styles.arrow} type="button" onClick={() => goTo(pos.i + 1)} disabled={pos.atEnd} aria-label="Next game" aria-controls="deck">
          <Icon name="chevR" />
        </button>
      </div>
    </section>
  );
}
