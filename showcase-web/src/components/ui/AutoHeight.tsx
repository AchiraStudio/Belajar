import { motion } from 'motion/react';
import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { EASE_OUT } from '../../lib/motion';

/**
 * Animates its own height to match its content. Panels of different heights swap without the
 * page below jumping, and content that opens inside (an answer, a result) pushes smoothly.
 */
export function AutoHeight({ children, className }: { children: ReactNode; className?: string }) {
  const inner = useRef<HTMLDivElement>(null);
  const [h, setH] = useState<number | 'auto'>('auto');

  useLayoutEffect(() => {
    const el = inner.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setH(el.getBoundingClientRect().height));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <motion.div className={className} animate={{ height: h }} initial={false} transition={{ duration: 0.45, ease: EASE_OUT }} style={{ overflow: 'clip', overflowClipMargin: 12 }}>
      <div ref={inner}>{children}</div>
    </motion.div>
  );
}
