import { motion, useScroll, useTransform } from 'motion/react';
import { useRef } from 'react';
import mHomeDark from '../../../assets/shots/m-home-dark.webp';
import mHomeLight from '../../../assets/shots/m-home-light.webp';
import mMateriDark from '../../../assets/shots/m-materi-dark.webp';
import mMateriLight from '../../../assets/shots/m-materi-light.webp';
import { EASE_OUT } from '../../../lib/motion';
import { Phone, ThemedImage } from '../../ui/Frames';
import { Reveal } from '../../ui/Reveal';
import { Kicker } from '../../ui/SectionHead';
import { DockDemo } from './DockDemo';
import styles from './PhoneSection.module.css';

export function PhoneSection() {
  const phones = useRef<HTMLDivElement>(null);
  // The two phones drift in opposite directions while the section passes through the viewport.
  const { scrollYProgress } = useScroll({ target: phones, offset: ['start end', 'end start'] });
  const yA = useTransform(scrollYProgress, [0, 1], [50, -50]);
  const yB = useTransform(scrollYProgress, [0, 1], [-10, 90]);

  return (
    <section className={`wrap ${styles.sec}`} id="phone" aria-labelledby="h-phone">
      <div className={styles.grid}>
        <div className={styles.copy}>
          <Reveal><Kicker>On your phone</Kicker></Reveal>
          <Reveal delay={0.05}><h2 id="h-phone">Five tabs. Hold one for its neighbours.</h2></Reveal>
          <Reveal as="p" delay={0.1}>The phone layout is its own design, not the desktop grid squeezed narrow: one focal card for today, a sideways scroller, a plain stat strip.</Reveal>
          <Reveal as="p" delay={0.15}>Navigation is five tabs. Tap to go. Hold a tab and the related pages rise out of it; slide onto one and release to open it. Try it on the dock below: press and hold a tab, or focus it and press the up arrow.</Reveal>
          <Reveal delay={0.2}><DockDemo /></Reveal>
          <p className={styles.cap}>A sun dot marks pages that are visible but not built yet.</p>
        </div>

        <div className={styles.phones} ref={phones}>
          <motion.div className={styles.a} style={{ y: yA }}>
            <Phone
              className={styles.phoneA}
              initial={{ opacity: 0, rotate: -12, x: -30 }}
              whileInView={{ opacity: 1, rotate: -4, x: 0 }}
              viewport={{ once: true, margin: '0px 0px -10% 0px' }}
              transition={{ duration: 0.9, ease: EASE_OUT }}
            >
              <ThemedImage
                light={mHomeLight}
                dark={mHomeDark}
                alt="The phone home screen: today's goal card, a Continue studying scroller and a stat strip"
                altDark="The phone home screen in the dark theme"
                width={780}
                height={1688}
              />
            </Phone>
          </motion.div>
          <motion.div className={styles.b} style={{ y: yB }}>
            <Phone
              className={styles.phoneB}
              initial={{ opacity: 0, rotate: 10, x: 30 }}
              whileInView={{ opacity: 1, rotate: 3, x: 0 }}
              viewport={{ once: true, margin: '0px 0px -10% 0px' }}
              transition={{ duration: 0.9, delay: 0.12, ease: EASE_OUT }}
            >
              <ThemedImage
                light={mMateriLight}
                dark={mMateriDark}
                alt="The phone materials library with subject filters and document cards"
                altDark="The phone materials library in the dark theme"
                width={780}
                height={1688}
              />
            </Phone>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
