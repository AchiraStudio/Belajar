import { LIMITS } from '../../data/content';
import { Reveal } from '../ui/Reveal';
import { SectionHead } from '../ui/SectionHead';
import styles from './Limits.module.css';

/** Wraps file extensions like .doc and .docx in <code>, the way the original page did. */
function Text({ text }: { text: string }) {
  return <>{text.split(/(\.(?:doc|ppt|docx|pptx)\b)/g).map((p, i) => (i % 2 ? <code key={i}>{p}</code> : p))}</>;
}

export function Limits() {
  return (
    <section className={`wrap ${styles.limits}`} id="limits" aria-labelledby="h-limits">
      <SectionHead kicker="Limits" id="h-limits" title="What is not here yet." sub="So nothing above surprises you later." />
      <ul className={styles.list}>
        {LIMITS.map((l, i) => (
          <Reveal as="li" key={l.text} delay={(i % 2) * 0.07} className={styles.item}>
            <Text text={l.text} />
          </Reveal>
        ))}
      </ul>
    </section>
  );
}
