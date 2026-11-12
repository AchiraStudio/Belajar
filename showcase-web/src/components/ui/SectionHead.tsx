import type { ReactNode } from 'react';
import styles from './SectionHead.module.css';
import { Reveal } from './Reveal';

/** The bamboo node that precedes every section label: the identity motif at small scale. */
export function Kicker({ children }: { children: ReactNode }) {
  return (
    <p className={styles.kicker}>
      <svg className={styles.node} viewBox="0 0 24 24" aria-hidden="true">
        <rect x="3" y="7" width="18" height="10" rx="3" />
        <path d="M9 7v10M15 7v10" />
      </svg>
      {children}
    </p>
  );
}

interface Props {
  kicker: string;
  id: string;
  title: ReactNode;
  sub?: ReactNode;
  split?: boolean;
  /** Set when the head sits on the dark band, so kicker and sub switch to their band colours. */
  onDark?: boolean;
}

export function SectionHead({ kicker, id, title, sub, split, onDark }: Props) {
  const head = (
    <>
      <div>
        <Kicker>{kicker}</Kicker>
        <h2 id={id}>{title}</h2>
      </div>
      {sub && <p className={styles.sub}>{sub}</p>}
    </>
  );
  return (
    <Reveal as="header" className={[styles.head, split && styles.split, onDark && styles.dark].filter(Boolean).join(' ')}>
      {head}
    </Reveal>
  );
}
