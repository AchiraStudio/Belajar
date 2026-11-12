import { AnimatePresence, motion } from 'motion/react';
import { useRef, useState, type KeyboardEvent } from 'react';
import { CARD_DECK, GRADES, type GradeKey } from '../../../data/content';
import { EASE_OUT, spring } from '../../../lib/motion';
import { Button } from '../../ui/Button';
import { Caption, Win } from '../../ui/Frames';
import local from './CardsPanel.module.css';
import styles from './Panel.module.css';

/** Mirrors the app: "Again" sends the card to the back of the queue, any other grade removes it. */
export function CardsPanel() {
  const [queue, setQueue] = useState<number[]>(() => CARD_DECK.map((_, i) => i));
  const [flipped, setFlipped] = useState(false);
  const [again, setAgain] = useState(0);
  const [graded, setGraded] = useState(0);
  const lastGrade = useRef<GradeKey>('good');
  const stage = useRef<HTMLDivElement>(null);

  const current = queue[0];
  const card = current === undefined ? null : CARD_DECK[current]!;

  const focusSoon = (sel: string) => requestAnimationFrame(() => stage.current?.querySelector<HTMLElement>(sel)?.focus());

  const grade = (g: GradeKey) => {
    if (!flipped || current === undefined) return;
    lastGrade.current = g;
    setFlipped(false);
    setGraded((n) => n + 1);
    setQueue((q) => (g === 'again' ? [...q.slice(1), q[0]!] : q.slice(1)));
    if (g === 'again') setAgain((n) => n + 1);
    focusSoon('[data-card]');
  };

  const restart = () => {
    setQueue(CARD_DECK.map((_, i) => i));
    setFlipped(false);
    setAgain(0);
    setGraded(0);
    focusSoon('[data-card]');
  };

  const onKey = (e: KeyboardEvent) => {
    const g = GRADES[Number(e.key) - 1];
    if (flipped && g) { e.preventDefault(); grade(g.key); }
  };

  const left = queue.length;

  return (
    <div className={styles.panel}>
      <Win className={local.win}>
        <div className={local.stage} ref={stage} onKeyDown={onKey}>
          {card ? (
            <>
              <p className={local.count} aria-live="polite">{left} {left === 1 ? 'card' : 'cards'} left</p>

              <div className={local.deck}>
                {left > 2 && <span className={`${local.ghost} ${local.g2}`} aria-hidden="true" />}
                {left > 1 && <span className={`${local.ghost} ${local.g1}`} aria-hidden="true" />}
                <AnimatePresence mode="popLayout" custom={lastGrade.current} initial={false}>
                  <motion.button
                    key={`${current}-${graded}`}
                    type="button"
                    data-card
                    className={local.card}
                    aria-live="polite"
                    aria-label={flipped ? `Card back: ${card.back}. Press to flip to the front.` : `Card front: ${card.front}. Press to show the answer.`}
                    onClick={() => setFlipped((f) => !f)}
                    custom={lastGrade.current}
                    variants={{
                      enter: { opacity: 0, y: 26, scale: 0.94 },
                      center: { opacity: 1, y: 0, scale: 1, x: 0, rotate: 0 },
                      exit: (g: GradeKey) => (g === 'again'
                        ? { opacity: 0, x: -140, rotate: -9, scale: 0.96 }
                        : { opacity: 0, x: 150, rotate: 8, scale: 0.96 }),
                    }}
                    initial="enter"
                    animate="center"
                    exit="exit"
                    transition={{ duration: 0.42, ease: EASE_OUT }}
                    whileHover={{ y: -3 }}
                  >
                    <motion.span className={local.flip} animate={{ rotateY: flipped ? 180 : 0 }} transition={spring.soft}>
                      <span className={`${local.face} ${local.front}`} aria-hidden="true"><small>Front</small>{card.front}</span>
                      <span className={`${local.face} ${local.back}`} aria-hidden="true"><small>Back</small>{card.back}</span>
                    </motion.span>
                  </motion.button>
                </AnimatePresence>
              </div>

              <p className={local.hint}>{flipped ? 'How well did you remember it?' : 'Space or click to flip'}</p>

              <div className={local.gradesSlot}>
                <AnimatePresence>
                  {flipped && (
                    <motion.div className={local.grades} variants={{ hidden: { transition: { staggerChildren: 0.03, staggerDirection: -1 } }, show: { transition: { staggerChildren: 0.05 } } }} initial="hidden" animate="show" exit="hidden">
                      {GRADES.map((g, i) => (
                        <motion.button
                          key={g.key}
                          type="button"
                          className={`${local.grade} ${g.key === 'again' ? local.again : ''}`}
                          onClick={() => grade(g.key)}
                          variants={{ hidden: { opacity: 0, y: 14, transition: { duration: 0.18 } }, show: { opacity: 1, y: 0, transition: { duration: 0.28, ease: EASE_OUT } } }}
                        >
                          <b>{g.label}</b><small>{g.hint}</small><kbd>{i + 1}</kbd>
                        </motion.button>
                      ))}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </>
          ) : (
            <motion.div className={local.done} initial={{ opacity: 0, scale: 0.94 }} animate={{ opacity: 1, scale: 1 }} transition={spring.bouncy}>
              <p className={local.big}>Review done.</p>
              <p>{CARD_DECK.length} cards reviewed{again ? `, ${again} sent back to the queue` : ''}.</p>
              <Button small onClick={restart} data-card>Review again</Button>
            </motion.div>
          )}
        </div>
        <Caption>Sample cards. Grade with the buttons or keys 1 to 4.</Caption>
      </Win>

      <div className={styles.copy}>
        <h3>The hard ones come back sooner.</h3>
        <p>Cards follow the SM-2 spaced-repetition schedule: what you know appears less and less often, what you struggle with returns. Grading a card <em>Again</em> puts it back in the queue; any other grade sends it away until it is due.</p>
        <p>Cards are built from concepts and games, so a weak concept in a game lands here on its own. Export everything as an Anki-compatible TSV.</p>
      </div>
    </div>
  );
}
