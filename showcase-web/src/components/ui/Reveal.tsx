import { motion } from 'motion/react';
import type { ReactNode } from 'react';
import { EASE_OUT } from '../../lib/motion';

type Tag = 'div' | 'li' | 'header' | 'p' | 'section' | 'ol' | 'ul';

interface Props {
  children: ReactNode;
  as?: Tag;
  delay?: number;
  /** Travel distance in px. */
  y?: number;
  x?: number;
  className?: string;
}

/**
 * Scroll reveal. Fires once when the element is ~10% into the viewport, then stays.
 * Purpose: it tells the eye which block just arrived while reading downward; nothing loops.
 */
export function Reveal({ children, as = 'div', delay = 0, y = 28, x = 0, className }: Props) {
  const Tag = motion[as];
  return (
    <Tag
      className={className}
      initial={{ opacity: 0, y, x }}
      whileInView={{ opacity: 1, y: 0, x: 0 }}
      viewport={{ once: true, margin: '0px 0px -10% 0px' }}
      transition={{ duration: 0.7, delay, ease: EASE_OUT }}
    >
      {children}
    </Tag>
  );
}
