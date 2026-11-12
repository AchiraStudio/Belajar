import { AnimatePresence, motion } from 'motion/react';
import { useRef, useState } from 'react';
import { SPOT_SENTENCES, SPOT_WRONG } from '../../../data/content';
import { EASE_OUT, spring } from '../../../lib/motion';
import { Button } from '../../ui/Button';
import styles from './Games.module.css';

const Tc = () => <>T<sub>c</sub></>;
const Th = () => <>T<sub>h</sub></>;

/** The sentences are plain strings in the data file; Tc / Th get their subscripts here. */
function Sentence({ text }: { text: string }) {
  const parts = text.split(/(Tc|Th)/g);
  return <>{parts.map((p, i) => (p === 'Tc' ? <Tc key={i} /> : p === 'Th' ? <Th key={i} /> : p))}</>;
}

export function SpotGame() {
  const [pick, setPick] = useState<number | null>(null);
  const list = useRef<HTMLUListElement>(null);
  const again = useRef<HTMLButtonElement>(null);

  const choose = (i: number) => { setPick(i); requestAnimationFrame(() => again.current?.focus()); };
  const reset = () => { setPick(null); requestAnimationFrame(() => list.current?.querySelector('button')?.focus()); };
  const answered = pick !== null;

  return (
    <>
      <ul className={styles.sentences} ref={list}>
        {SPOT_SENTENCES.map((s, i) => {
          const found = answered && i === SPOT_WRONG;
          const miss = answered && i === pick && i !== SPOT_WRONG;
          return (
            <li key={s}>
              <motion.button
                type="button"
                className={`${styles.sentence} ${found ? styles.found : ''} ${miss ? styles.miss : ''}`}
                disabled={answered}
                onClick={() => choose(i)}
                animate={found ? { scale: [1, 1.03, 1] } : miss ? { x: [0, -6, 6, -3, 0] } : { scale: 1, x: 0 }}
                transition={found ? spring.bouncy : { duration: 0.4, ease: EASE_OUT }}
              >
                <Sentence text={s} />
                <AnimatePresence initial={false}>
                  {found && (
                    <motion.span key="f" className={styles.tag} initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} transition={{ duration: 0.3, ease: EASE_OUT }}>
                      The error: a warmer cold side lowers η.
                    </motion.span>
                  )}
                  {miss && (
                    <motion.span key="m" className={styles.tag} initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} transition={{ duration: 0.3, ease: EASE_OUT }}>
                      Not this one: this sentence is correct.
                    </motion.span>
                  )}
                </AnimatePresence>
              </motion.button>
            </li>
          );
        })}
      </ul>
      <p className={styles.spotOut} aria-live="polite">
        {answered ? (pick === SPOT_WRONG ? 'Found it. ' : 'Not quite. ') : 'Tap the sentence you think is wrong.'}
        {answered && <Button small ref={again} onClick={reset} className={styles.again}>Play again</Button>}
      </p>
    </>
  );
}
