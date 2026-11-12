import { AnimatePresence, motion } from 'motion/react';
import { useRef, useState, type FormEvent } from 'react';
import { CHOICE_QUESTIONS, QUIZ_MODES, QUIZ_TYPES, SHORT_ANSWER, type QuizMode, type QuizType } from '../../../data/content';
import { EASE_OUT, spring } from '../../../lib/motion';
import { Button } from '../../ui/Button';
import { Caption, Win } from '../../ui/Frames';
import { Segmented } from '../../ui/Segmented';
import styles from './Panel.module.css';
import local from './QuizPanel.module.css';

const LETTERS = ['A', 'B', 'C', 'D'];
type ShortResult = 'right' | 'unsure' | 'wrong';

const SHORT_FEEDBACK: Record<ShortResult, { tone: 'good' | 'bad' | 'neutral'; title: string; body: string }> = {
  right: { tone: 'good', title: 'Correct.', body: 'Kelvin, an absolute scale. Matched by the local grader.' },
  unsure: { tone: 'neutral', title: 'Close, so this is where AI steps in.', body: 'The answer mentions an absolute scale but not which one. Uncertain matches go to the AI grader; clear ones never do.' },
  wrong: { tone: 'bad', title: 'Not quite.', body: 'Hint: it is an absolute scale. The answer is kelvin.' },
};

function grade(answer: string): ShortResult {
  if (/kelvin|\bK\b/i.test(answer)) return 'right';
  if (/absolute/i.test(answer)) return 'unsure';
  return 'wrong';
}

export function QuizPanel() {
  const [type, setType] = useState<QuizType>('mc');
  const [mode, setMode] = useState<QuizMode>('practice');
  const [picked, setPicked] = useState<number | null>(null);
  const [done, setDone] = useState(false);
  const [text, setText] = useState('');
  const [result, setResult] = useState<ShortResult | null>(null);
  const body = useRef<HTMLDivElement>(null);

  const reset = () => { setPicked(null); setDone(false); setText(''); setResult(null); };
  const exam = mode === 'exam';

  const focusLater = (sel: string) => requestAnimationFrame(() => body.current?.querySelector<HTMLElement>(sel)?.focus());

  const pick = (i: number) => {
    if (done) return;
    setPicked(i);
    if (!exam) { setDone(true); focusLater('[data-reset]'); }
  };
  const submitShort = (e: FormEvent) => {
    e.preventDefault();
    setResult(grade(text.trim()));
    setDone(true);
    focusLater('[data-reset]');
  };

  const q = type === 'sa' ? null : CHOICE_QUESTIONS[type];
  const caption = q ? q.src : SHORT_ANSWER.src;
  const choiceOk = q && picked === q.right;
  const fb = result ? SHORT_FEEDBACK[result] : null;

  return (
    <div className={styles.panel}>
      <Win>
        <div className={`${styles.barPad} ${local.bar}`}>
          <Segmented label="Question type" options={QUIZ_TYPES} value={type} onChange={(v) => { setType(v); reset(); }} />
          <Segmented label="Quiz mode" options={QUIZ_MODES} value={mode} onChange={(v) => { setMode(v); reset(); }} />
        </div>

        <div className={local.body} ref={body}>
          <div className={local.meta}>
            <span>Question 1 of 5</span>
            <span className={local.timer}>{exam ? 'Exam: timer running, graded when you submit' : 'Practice: instant feedback'}</span>
          </div>

          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={`${type}-${mode}`}
              className={local.qwrap}
              initial={{ opacity: 0, x: 18 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -18 }}
              transition={{ duration: 0.26, ease: EASE_OUT }}
            >
              <p className={local.text}>{q ? q.text : SHORT_ANSWER.text}</p>

              {q ? (
                <div className={local.opts} role="group" aria-label="Answers">
                  {q.opts.map((o, i) => {
                    const state = done ? (i === q.right ? 'right' : i === picked ? 'wrong' : '') : i === picked ? 'picked' : '';
                    const mark = done ? (i === q.right ? 'Correct' : i === picked ? 'Your pick' : '') : i === picked ? 'Selected' : '';
                    return (
                      <motion.button
                        key={o}
                        type="button"
                        className={`${local.opt} ${state ? local[state] : ''}`}
                        disabled={done}
                        aria-pressed={i === picked}
                        onClick={() => pick(i)}
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.3, delay: 0.05 + i * 0.05, ease: EASE_OUT }}
                        whileTap={done ? undefined : { scale: 0.985 }}
                      >
                        <span className={local.k}>{type === 'tf' ? (i === 0 ? 'T' : 'F') : LETTERS[i]}</span>
                        <span>{o}</span>
                        <span className={local.mark}>{mark}</span>
                      </motion.button>
                    );
                  })}
                </div>
              ) : (
                <form className={local.sa} onSubmit={submitShort} noValidate>
                  <label htmlFor="sa-input">Your answer</label>
                  <input id="sa-input" type="text" autoComplete="off" value={text} disabled={done} onChange={(e) => setText(e.target.value)} />
                  <Button small type="submit" disabled={done}>{exam ? 'Submit exam' : 'Check answer'}</Button>
                </form>
              )}
            </motion.div>
          </AnimatePresence>

          {q && exam && !done && (
            <div><Button small variant="primary" disabled={picked === null} onClick={() => { setDone(true); focusLater('[data-reset]'); }}>Submit exam</Button></div>
          )}

          <AnimatePresence initial={false}>
            {done && (q || fb) && (
              <motion.div
                key="explain"
                role="status"
                className={`${local.explain} ${q ? (choiceOk ? local.isGood : local.isBad) : fb ? (local[`is-${fb.tone}`] ?? '') : ''}`}
                initial={{ opacity: 0, y: 10, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 6 }}
                transition={spring.bouncy}
              >
                <b>{q ? (choiceOk ? 'Correct.' : 'Not quite.') : fb!.title}</b>
                {q ? q.why : fb!.body}
              </motion.div>
            )}
          </AnimatePresence>
          {done && <div><Button small data-reset onClick={() => { reset(); focusLater(type === 'sa' ? '#sa-input' : 'button[aria-pressed]'); }}>{type === 'sa' ? 'Try another answer' : 'Reset question'}</Button></div>}
        </div>
        <Caption>{caption}</Caption>
      </Win>

      <div className={styles.copy}>
        <h3>Questions that point back to your pages.</h3>
        <p>Multiple choice, true or false and short answer, spread evenly across the material, with the source page or slide cited on each question. Practice mode gives instant feedback. Exam mode adds a timer, grades only on submit and survives a reload.</p>
        <p>Short answers are graded locally first; AI steps in only when the match is uncertain. Anything you last got wrong goes into a Weak questions queue to review.</p>
      </div>
    </div>
  );
}
