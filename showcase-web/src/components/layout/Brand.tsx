import mark from '../../assets/brand/stuby-mark.svg';
import styles from './Brand.module.css';

export function Brand() {
  return (
    <a className={styles.brand} href="#top" aria-label="Stuby, back to top">
      <span className={styles.tile}>
        <img src={mark} alt="" width={28} height={28} />
      </span>
      <span className={styles.word}>stuby</span>
    </a>
  );
}
