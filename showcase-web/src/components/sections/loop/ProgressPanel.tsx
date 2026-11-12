import { motion } from 'motion/react';
import { useMemo } from 'react';
import { HEAT_SEED } from '../../../data/content';
import { EASE_OUT } from '../../../lib/motion';
import { CountUp } from '../../ui/CountUp';
import { Caption, Win } from '../../ui/Frames';
import { Icon } from '../../ui/Icon';
import styles from './Panel.module.css';
import local from './ProgressPanel.module.css';

const WEEKS = 20;
const DAYS = 7;

/** Seeded so the sample looks the same on every visit (a mulberry32 generator). */
function makeHeat(): number[] {
  let s = HEAT_SEED;
  const rnd = () => {
    s |= 0; s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return Array.from({ length: WEEKS * DAYS }, (_, i) => {
    const r = rnd();
    let l = r < 0.3 ? 0 : r < 0.55 ? 1 : r < 0.78 ? 2 : r < 0.92 ? 3 : 4;
    if (i >= WEEKS * DAYS - 7) l = Math.max(l, 2); // the last 7 days: a 7-day streak
    return l;
  });
}

export function ProgressPanel() {
  const heat = useMemo(makeHeat, []);

  return (
    <div className={styles.panel}>
      <Win>
        <div className={local.top}>
          <div className={local.streak}>
            <span className={local.tl}>Study streak</span>
            <span className={local.tv}>
              <motion.span
                className={local.flame}
                initial={{ rotate: 0, scale: 0.7 }}
                whileInView={{ rotate: [0, -10, 8, -4, 0], scale: [0.7, 1.15, 1] }}
                viewport={{ once: true }}
                transition={{ duration: 0.9, delay: 0.3, ease: EASE_OUT }}
              >
                <Icon name="flame" size={26} />
              </motion.span>
              <CountUp to={7} /> days
            </span>
            <span className={local.th}>Today's goal reached</span>
          </div>
          <div className={local.ink}>
            <span className={local.tl}>Quizzes completed</span>
            <span className={local.tv}><CountUp to={8} /> <i><CountUp to={85} />%</i></span>
            <span className={local.th}>Average accuracy across all quizzes</span>
          </div>
        </div>

        <div className={local.heatWrap}>
          <p className={local.heatTitle}>Activity, last 20 weeks</p>
          <motion.div
            className={local.heat}
            role="img"
            aria-label="Sample activity map: 20 weeks by 7 days, darker green means more study that day"
            variants={{ hidden: {}, show: { transition: { staggerChildren: 0.012 } } }}
            initial="hidden"
            whileInView="show"
            viewport={{ once: true, margin: '0px 0px -12% 0px' }}
          >
            {heat.map((l, i) => (
              <motion.i
                key={i}
                data-l={l}
                variants={{ hidden: { opacity: 0, scale: 0.3 }, show: { opacity: 1, scale: 1, transition: { duration: 0.4, ease: EASE_OUT } } }}
                style={{ gridColumn: Math.floor(i / DAYS) + 1, gridRow: (i % DAYS) + 1 }}
              />
            ))}
          </motion.div>
        </div>
        <Caption>Sample data, not a real account.</Caption>
      </Win>

      <div className={styles.copy}>
        <h3>Progress you can trust.</h3>
        <p>A daily streak with freezes, a 20-week activity map, a weekly goal, scores per quiz and topic, and study time. A day counts toward your streak when you reach the daily goal or finish one quiz.</p>
        <p>Each concept gets a mastery score that is updated from different kinds of evidence. It counts as mastered only with enough, varied proof.</p>
      </div>
    </div>
  );
}
