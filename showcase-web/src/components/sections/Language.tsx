import { AnimatePresence, motion } from 'motion/react';
import { useState } from 'react';
import { LANGS, type LangKey } from '../../data/content';
import { EASE_OUT } from '../../lib/motion';
import { Reveal } from '../ui/Reveal';
import { Kicker } from '../ui/SectionHead';
import { Segmented } from '../ui/Segmented';
import styles from './Language.module.css';

const OPTIONS = (Object.keys(LANGS) as LangKey[]).map((k) => ({ value: k, label: LANGS[k].label }));

export function Language() {
  const [lang, setLang] = useState<LangKey>('en');
  const L = LANGS[lang];

  return (
    <section className={`wrap ${styles.you}`} id="you" aria-labelledby="h-you">
      <div className={styles.grid}>
        <div className={styles.copy}>
          <Reveal><Kicker>Your level, your language</Kicker></Reveal>
          <Reveal as="div" delay={0.05}><h2 id="h-you">It talks to you the way you study.</h2></Reveal>
          <Reveal as="p" delay={0.1}>Choose your learning level, from primary school to professional, and the copy, pacing and suggestions adapt. Scholarships and competitions that match your level appear with their deadlines, and you can save the ones you want.</Reveal>
          <Reveal as="p" delay={0.15}>The interface comes in four languages. Pick one here to see the real strings from the app's home screen.</Reveal>
        </div>

        <Reveal className={styles.demo} delay={0.1}>
          <Segmented large label="Interface language" options={OPTIONS} value={lang} onChange={setLang} />
          <div className={styles.card} lang={lang}>
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={lang}
                className={styles.cardIn}
                initial={{ opacity: 0, y: 14, filter: 'blur(5px)' }}
                animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                exit={{ opacity: 0, y: -10, filter: 'blur(5px)' }}
                transition={{ duration: 0.26, ease: EASE_OUT }}
              >
                <h3 className={styles.hi}>{L.hi}</h3>
                <p className={styles.level}><span>{L.level}</span></p>
                <ul className={styles.nav}>
                  {L.nav.map((n, i) => (
                    <motion.li key={n} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 + i * 0.04, duration: 0.3, ease: EASE_OUT }}>{n}</motion.li>
                  ))}
                </ul>
                <p className={styles.cont}>{L.cont}</p>
              </motion.div>
            </AnimatePresence>
          </div>
          <p className={styles.cap}>Strings copied from the app's translation table.</p>
        </Reveal>
      </div>
    </section>
  );
}
