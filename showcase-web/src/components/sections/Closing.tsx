import { motion } from 'motion/react';
import mark from '../../assets/brand/stuby-mark.svg';
import { REPO_URL } from '../../data/content';
import { EASE_OUT, spring } from '../../lib/motion';
import { Button } from '../ui/Button';
import { Reveal } from '../ui/Reveal';
import styles from './Closing.module.css';

export function Closing() {
  return (
    <section className={styles.closing} aria-labelledby="h-close">
      <div className={`wrap ${styles.in}`}>
        <motion.img
          className={styles.mark}
          src={mark}
          alt=""
          width={132}
          height={131}
          initial={{ opacity: 0, scale: 0.6, rotate: -24 }}
          whileInView={{ opacity: 1, scale: 1, rotate: -6 }}
          viewport={{ once: true, margin: '0px 0px -15% 0px' }}
          transition={{ ...spring.bouncy, duration: 0.8 }}
          whileHover={{ rotate: 4, scale: 1.06 }}
        />
        <div>
          <Reveal><h2 id="h-close">Run it on your own machine.</h2></Reveal>
          <motion.p
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, delay: 0.1, ease: EASE_OUT }}
          >
            MIT licensed. The source, the setup guides and the Linux installer are all in the repository.
          </motion.p>
          <Reveal className={styles.cta} delay={0.2}>
            <Button variant="ink" href={REPO_URL} target="_blank">Clone it from GitHub</Button>
            <Button variant="light" href="#run">Try the UI with fictional data</Button>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
