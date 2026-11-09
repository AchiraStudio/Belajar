import { Link, Outlet } from 'react-router';
import { HealthBadge } from '../../features/health/HealthBadge';
import styles from './AppShell.module.css';

export function AppShell() {
  return (
    <>
      <a className="skip" href="#view">
        Langsung ke isi halaman
      </a>
      <header className={styles.top}>
        <Link className={styles.brand} to="/">
          belajar
        </Link>
        <HealthBadge />
      </header>
      <main id="view" className={styles.page} tabIndex={-1}>
        <Outlet />
      </main>
    </>
  );
}
