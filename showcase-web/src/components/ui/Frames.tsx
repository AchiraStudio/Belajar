import type { ComponentProps, ReactNode } from 'react';
import { motion } from 'motion/react';
import styles from './Frames.module.css';

interface ThemedProps {
  light: string;
  dark: string;
  alt: string;
  altDark?: string;
  width: number;
  height: number;
  eager?: boolean;
  className?: string;
}

/** Both theme variants are in the DOM; base.css decides which one paints. */
export function ThemedImage({ light, dark, alt, altDark, width, height, eager, className }: ThemedProps) {
  const shared = { width, height, className, loading: eager ? undefined : ('lazy' as const), fetchPriority: eager ? ('high' as const) : undefined, decoding: 'async' as const };
  return (
    <>
      <img {...shared} className={`only-light ${className ?? ''}`} src={light} alt={alt} />
      <img {...shared} className={`only-dark ${className ?? ''}`} src={dark} alt={altDark ?? alt} />
    </>
  );
}

type WinProps = ComponentProps<typeof motion.figure> & { children: ReactNode; flat?: boolean };

/** The sticker window: heavy outline plus a hard offset shadow. Primary content in a view only. */
export function Win({ children, className, flat, ...rest }: WinProps) {
  return (
    <motion.figure className={`${styles.win} ${flat ? styles.flat : ''} ${className ?? ''}`} {...rest}>
      {children}
    </motion.figure>
  );
}

export function Caption({ children, className }: { children: ReactNode; className?: string }) {
  return <figcaption className={`${styles.cap} ${className ?? ''}`}>{children}</figcaption>;
}

type PhoneProps = ComponentProps<typeof motion.figure> & { children: ReactNode };
export function Phone({ children, className, ...rest }: PhoneProps) {
  return (
    <motion.figure className={`${styles.phone} ${className ?? ''}`} {...rest}>
      {children}
    </motion.figure>
  );
}
