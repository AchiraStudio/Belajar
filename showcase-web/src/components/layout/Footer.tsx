import { REPO_URL } from '../../data/content';
import { Brand } from './Brand';
import styles from './Footer.module.css';

export function Footer() {
  return (
    <footer className={styles.foot}>
      <div className={`wrap ${styles.in}`}>
        <Brand />
        <p>Study from your own material. MIT licensed.</p>
        <nav aria-label="Footer">
          <a href="#limits">Limits</a>
          <a href="#private">Privacy</a>
          <a href={REPO_URL} target="_blank" rel="noopener">GitHub</a>
        </nav>
      </div>
    </footer>
  );
}
