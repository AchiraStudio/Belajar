import styles from './HealthBadge.module.css';
import { useHealth } from './useHealth';

export function HealthBadge() {
  const health = useHealth();

  const label =
    health.kind === 'loading'
      ? 'Memeriksa server…'
      : health.kind === 'ok'
        ? `Server terhubung · v${health.version}`
        : 'Server tidak terjangkau';

  return (
    <div className={`${styles.badge} ${styles[health.kind]}`} role="status" title={label}>
      <i className={styles.dot} aria-hidden="true" />
      <span>{label}</span>
    </div>
  );
}
