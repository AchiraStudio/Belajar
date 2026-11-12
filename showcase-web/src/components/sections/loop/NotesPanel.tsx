import { AnimatePresence, motion } from 'motion/react';
import { useState, type ReactNode } from 'react';
import { NOTE_STYLES, type NoteStyle } from '../../../data/content';
import { EASE_OUT } from '../../../lib/motion';
import { Button } from '../../ui/Button';
import { Win } from '../../ui/Frames';
import { Segmented } from '../../ui/Segmented';
import local from './NotesPanel.module.css';
import styles from './Panel.module.css';

const Tc = () => <>T<sub>c</sub></>;
const Th = () => <>T<sub>h</sub></>;

const NOTES: Record<NoteStyle, ReactNode> = {
  cornell: (
    <>
      <h4>Carnot cycle</h4>
      <div className={local.cornell}>
        <div className={local.cues}><span>What sets the efficiency?</span><span>Why kelvin?</span></div>
        <div className={local.main}>
          <p>A Carnot engine runs between a hot reservoir at <Th /> and a cold one at <Tc />. Its efficiency depends only on those two temperatures: <b>η = 1 − <Tc /> / <Th /></b>.</p>
          <p>The ratio needs an absolute scale, so the temperatures are always in kelvin.</p>
        </div>
        <div className={local.sum}><b>Summary.</b> Efficiency rises when the cold side gets colder or the hot side gets hotter.</div>
      </div>
    </>
  ),
  outline: (
    <>
      <h4>Carnot cycle</h4>
      <ul className={local.outline}>
        <li>Four reversible steps
          <ul><li>Isothermal expansion, then adiabatic expansion</li><li>Isothermal compression, then adiabatic compression</li></ul>
        </li>
        <li>Efficiency
          <ul><li>η = 1 − <Tc /> / <Th /></li><li>Temperatures in kelvin</li></ul>
        </li>
        <li>Limit
          <ul><li>No real engine beats it between the same two temperatures</li></ul>
        </li>
      </ul>
    </>
  ),
  worked: (
    <>
      <h4>Worked example</h4>
      <div className={local.worked}>
        <div className={local.step}><b>Given</b><span><Th /> = 500 K, <Tc /> = 300 K</span></div>
        <div className={local.step}><b>Find</b><span>The maximum efficiency η</span></div>
        <div className={local.step}><b>Step 1</b><span>η = 1 − <Tc /> / <Th /></span></div>
        <div className={local.step}><b>Step 2</b><span>η = 1 − 300 / 500 = 1 − 0.6</span></div>
        <div className={local.ans}>η = 0.40, so at most 40% of the heat can become work.</div>
      </div>
    </>
  ),
};

export function NotesPanel() {
  const [style, setStyle] = useState<NoteStyle>('cornell');
  const [asking, setAsking] = useState(false);

  return (
    <div className={styles.panel}>
      <Win>
        <div className={`${styles.barPad} ${styles.barRow}`}>
          <Segmented label="Note style" options={NOTE_STYLES} value={style} onChange={setStyle} />
          <span className={styles.capInline}>Sample note</span>
        </div>
        <div className={local.note}>
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={style}
              initial={{ opacity: 0, y: 10, filter: 'blur(4px)' }}
              animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
              exit={{ opacity: 0, y: -6, filter: 'blur(4px)' }}
              transition={{ duration: 0.24, ease: EASE_OUT }}
            >
              {NOTES[style]}
            </motion.div>
          </AnimatePresence>
        </div>
        <div className={local.ask}>
          <Button small type="button" aria-expanded={asking} aria-controls="ask-answer" onClick={() => setAsking((a) => !a)}>
            Ask about "<Tc /> / <Th />"
          </Button>
          <AnimatePresence initial={false}>
            {asking && (
              <motion.div
                id="ask-answer"
                className={local.answer}
                initial={{ opacity: 0, height: 0, y: -6 }}
                animate={{ opacity: 1, height: 'auto', y: 0 }}
                exit={{ opacity: 0, height: 0, y: -6 }}
                transition={{ duration: 0.36, ease: EASE_OUT }}
              >
                <div className={local.answerIn}>
                  <p className={local.who}>You selected a line and asked: <em>why does a colder exhaust help?</em></p>
                  <p>The ratio <Tc />/<Th /> shrinks as the cold side gets colder, so 1 − <Tc />/<Th /> grows. That is why exhaust temperature matters so much for engine efficiency.</p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </Win>
      <div className={styles.copy}>
        <h3>Notes in the shape you study best.</h3>
        <p>General styles (concise, Cornell, simple) and detailed ones (Sentence, Charting, Outline, Worked Examples). Output is Markdown with LaTeX math and code cards. You can edit it, download it or regenerate it.</p>
        <p>Select any text in a note to ask about it, or open the chat for the whole document. Answers stream in and the history is kept.</p>
      </div>
    </div>
  );
}
