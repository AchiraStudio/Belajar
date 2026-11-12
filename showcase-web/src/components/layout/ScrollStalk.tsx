import { motion, useScroll, useSpring, useTransform } from 'motion/react';
import styles from './ScrollStalk.module.css';

/**
 * A bamboo stalk that grows with scroll position: the page's only progress indicator.
 * It is clipped rather than scaled so the node rings keep their spacing as it grows.
 */
export function ScrollStalk() {
  const { scrollYProgress } = useScroll();
  const eased = useSpring(scrollYProgress, { stiffness: 140, damping: 28, mass: 0.6 });
  const clip = useTransform(eased, (v) => `inset(0 ${(1 - Math.min(1, Math.max(0, v))) * 100}% 0 0)`);
  return (
    <div className={styles.stalk} aria-hidden="true">
      <motion.span className={styles.fill} style={{ clipPath: clip }} />
    </div>
  );
}
