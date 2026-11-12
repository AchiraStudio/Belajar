import type { Transition } from 'motion/react';

/** Shared easing and springs, so every animation on the page moves with the same feel. */
export const EASE_OUT = [0.22, 1, 0.36, 1] as const;

export const spring = {
  /** Default: quick, settles without wobble. UI that follows a pointer or a click. */
  snappy: { type: 'spring', stiffness: 420, damping: 34, mass: 0.8 } satisfies Transition,
  /** A little overshoot for things that "land": cards, the dock menu. */
  bouncy: { type: 'spring', stiffness: 360, damping: 22, mass: 0.9 } satisfies Transition,
  /** Slow and soft for large surfaces. */
  soft: { type: 'spring', stiffness: 170, damping: 26, mass: 1 } satisfies Transition,
};

export const fadeSlide = {
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -8 },
  transition: { duration: 0.32, ease: EASE_OUT },
} as const;
