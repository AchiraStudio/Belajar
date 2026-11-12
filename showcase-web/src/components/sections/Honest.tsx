import { motion } from 'motion/react';
import { EASE_OUT } from '../../lib/motion';
import { Icon } from '../ui/Icon';
import { Reveal } from '../ui/Reveal';
import { SectionHead } from '../ui/SectionHead';
import styles from './Honest.module.css';

export function Honest() {
  return (
    <section className={`wrap ${styles.honest}`} id="honest" aria-labelledby="h-honest">
      <SectionHead kicker="Honest data" id="h-honest" title={<>Zero means zero.<br />Unknown means unknown.</>} />

      <div className={styles.grid}>
        <div className={styles.copy}>
          <Reveal as="p">If you have not studied yet, a tracker that prints <b>0%</b> is telling you something false: that you tried and failed. Stuby shows a dash and says what is missing.</Reveal>
          <Reveal as="p" delay={0.06}>The right-hand tile is taken from the app. It appears when no daily goal exists, instead of a made-up number.</Reveal>
          <Reveal as="p" delay={0.12}>The same rule runs through mastery. A concept's score is built from different kinds of evidence, and it only counts as mastered with enough, varied proof.</Reveal>

          <Reveal className={styles.evidence} delay={0.18}>
            <ul aria-label="Kinds of evidence that feed a concept score">
              <li>Quiz answers</li><li>Game turns</li><li>Card reviews</li>
            </ul>
            <svg className={styles.bracket} viewBox="0 0 24 96" aria-hidden="true" preserveAspectRatio="none">
              <motion.path
                d="M2 4h8v88H2M10 48h12"
                initial={{ pathLength: 0 }}
                whileInView={{ pathLength: 1 }}
                viewport={{ once: true }}
                transition={{ duration: 0.9, delay: 0.3, ease: EASE_OUT }}
              />
            </svg>
            <span className={styles.concept}>One score per concept</span>
          </Reveal>
        </div>

        <div className={styles.tiles}>
          <Reveal className={styles.no}>
            <p className={styles.label}>What Stuby never shows</p>
            <div className={`${styles.card} ${styles.struck}`}>
              <span className={styles.tl}>Average accuracy</span>
              <span className={styles.tv}>
                <span className={styles.zero}>
                  0%
                  <motion.span
                    className={styles.strike}
                    aria-hidden="true"
                    initial={{ scaleX: 0 }}
                    whileInView={{ scaleX: 1 }}
                    viewport={{ once: true, margin: '0px 0px -20% 0px' }}
                    transition={{ duration: 0.55, delay: 0.5, ease: EASE_OUT }}
                  />
                </span>
              </span>
              <span className={styles.th}>Implies you answered everything wrong</span>
            </div>
          </Reveal>
          <Reveal className={styles.yes} delay={0.12}>
            <p className={styles.label}>What it shows instead</p>
            <div className={`${styles.card} ${styles.card2}`}>
              <span className={`${styles.tl} ${styles.tlRow}`}>Studied today <Icon name="quiz" size={18} /></span>
              <span className={styles.tv}>–</span>
              <span className={styles.th}>Daily goal not available yet</span>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
