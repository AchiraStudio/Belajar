import { AnimatePresence, motion } from 'motion/react';
import { useRef, useState, type ReactElement } from 'react';
import { STAGES } from '../../../data/content';
import { useRoving } from '../../../hooks/useRoving';
import { EASE_OUT, spring } from '../../../lib/motion';
import { AutoHeight } from '../../ui/AutoHeight';
import { SectionHead } from '../../ui/SectionHead';
import { CardsPanel } from './CardsPanel';
import { LibraryPanel } from './LibraryPanel';
import styles from './Loop.module.css';
import { MindMapPanel } from './MindMapPanel';
import { NotesPanel } from './NotesPanel';
import { ProgressPanel } from './ProgressPanel';
import { QuizPanel } from './QuizPanel';

const PANELS: Record<(typeof STAGES)[number]['id'], () => ReactElement> = {
  lib: LibraryPanel,
  notes: NotesPanel,
  map: MindMapPanel,
  quiz: QuizPanel,
  cards: CardsPanel,
  prog: ProgressPanel,
};

export function Loop() {
  const [index, setIndex] = useState(0);
  const dir = useRef(1);
  const pick = (i: number) => { dir.current = i >= index ? 1 : -1; setIndex(i); };
  const { ref, onKeyDown } = useRoving(STAGES.length, pick, 'vertical');
  const Panel = PANELS[STAGES[index]!.id];

  return (
    <section className={`wrap ${styles.loop}`} id="loop" aria-labelledby="h-loop">
      <SectionHead
        kicker="The study loop"
        id="h-loop"
        title="One file in. Six ways to learn it."
        sub="Pick a stage. The examples come from a sample thermodynamics PDF, so you can see the same material change shape."
      />

      <div className={styles.grid}>
        <div className={styles.stages} role="tablist" aria-label="Stages of the study loop" aria-orientation="vertical" onKeyDown={onKeyDown}>
          {STAGES.map((s, i) => {
            const on = i === index;
            return (
              <button
                key={s.id}
                ref={ref(i)}
                className={styles.stage}
                role="tab"
                id={`t-${s.id}`}
                aria-controls="loop-panel"
                aria-selected={on}
                tabIndex={on ? 0 : -1}
                type="button"
                onClick={() => pick(i)}
              >
                {on && <motion.span layoutId="stage-pill" className={styles.pill} transition={spring.snappy} />}
                <span className={styles.n}>{s.n}</span>
                <span className={styles.t}>{s.title}</span>
                <span className={styles.d}>{s.desc}</span>
              </button>
            );
          })}
        </div>

        <div className={styles.panels} id="loop-panel" role="tabpanel" aria-labelledby={`t-${STAGES[index]!.id}`} tabIndex={0}>
          <AutoHeight>
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={STAGES[index]!.id}
                initial={{ opacity: 0, y: 18 * dir.current }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -14 * dir.current }}
                transition={{ duration: 0.3, ease: EASE_OUT }}
              >
                <Panel />
              </motion.div>
            </AnimatePresence>
          </AutoHeight>
        </div>
      </div>
    </section>
  );
}
