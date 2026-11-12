import { motion } from 'motion/react';
import { PRIVACY_ROWS } from '../../data/content';
import { EASE_OUT } from '../../lib/motion';
import { Reveal } from '../ui/Reveal';
import { Kicker } from '../ui/SectionHead';
import styles from './Privacy.module.css';

export function Privacy() {
  return (
    <section className={styles.private} id="private" aria-labelledby="h-private">
      <div className={`wrap ${styles.grid}`}>
        <Reveal as="header" className={styles.head}>
          <Kicker>Privacy and security</Kicker>
          <h2 id="h-private">Built so each owner sees only their own rows.</h2>
          <p>These are design decisions in the code, listed in the repository's README. Nothing here is a certification.</p>
        </Reveal>

        <ol className={styles.rows}>
          <motion.span
            className={styles.rule}
            aria-hidden="true"
            initial={{ scaleX: 0 }}
            whileInView={{ scaleX: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 0.9, ease: EASE_OUT }}
          />
          {PRIVACY_ROWS.map((r, i) => (
            <Reveal as="li" key={r.title} delay={i * 0.07} x={24} y={0} className={styles.row}>
              <span className={styles.num} aria-hidden="true">{String(i + 1).padStart(2, '0')}</span>
              <b>{r.title}</b> {r.text}{r.code && <> <code>{r.code}</code></>}{r.after && <> {r.after}</>}
            </Reveal>
          ))}
        </ol>
      </div>
    </section>
  );
}
