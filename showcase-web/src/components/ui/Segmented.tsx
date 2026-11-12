import { motion } from 'motion/react';
import { useId } from 'react';
import { useRoving } from '../../hooks/useRoving';
import { spring } from '../../lib/motion';
import styles from './Segmented.module.css';

interface Props<T extends string> {
  label: string;
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  large?: boolean;
}

/**
 * Radio group drawn as a segmented control. The bamboo pill glides between options
 * (shared layout animation), so the eye follows the change instead of re-finding it.
 */
export function Segmented<T extends string>({ label, options, value, onChange, large }: Props<T>) {
  const id = useId();
  const { ref, onKeyDown } = useRoving(options.length, (i) => onChange(options[i]!.value));

  return (
    <div className={`${styles.seg} ${large ? styles.lg : ''}`} role="radiogroup" aria-label={label} onKeyDown={onKeyDown}>
      {options.map((o, i) => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            ref={ref(i)}
            type="button"
            role="radio"
            aria-checked={on}
            tabIndex={on ? 0 : -1}
            className={styles.opt}
            onClick={() => onChange(o.value)}
          >
            {on && <motion.span layoutId={`${id}-pill`} className={styles.pill} transition={spring.snappy} />}
            <span className={styles.text}>{o.label}</span>
          </button>
        );
      })}
    </div>
  );
}
