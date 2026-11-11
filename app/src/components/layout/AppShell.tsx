import React, { Suspense, useEffect, useState } from 'react';
import { Outlet } from 'react-router';
import { CommandMenu } from './CommandMenu';
import { MobileNav } from './MobileNav';
import { PageContainer } from './PageContainer';
import { Sidebar } from './Sidebar';
import { TitleBar } from './TitleBar';
import { TopBar } from './TopBar';
import { Skeleton } from '../ui/Skeleton';
import styles from './AppShell.module.css';

export function AppShell() {
  const [commandOpen, setCommandOpen] = useState(false);

  // Ctrl/Cmd+K opens the command menu from anywhere.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setCommandOpen((v) => !v);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className={styles.shellRoot}>
      <a className="skip" href="#view">
        Langsung ke isi halaman
      </a>

      <TitleBar />

      <div className={styles.bodyContainer}>
        <div className={styles.sidebarArea}>
          <Sidebar />
        </div>

        <div className={styles.contentWrapper}>
          <TopBar onSearchClick={() => setCommandOpen(true)} />
          <main id="view" className={styles.mainContent} tabIndex={-1}>
            <PageContainer>
              <Suspense
                fallback={
                  <div aria-busy="true" aria-label="Memuat halaman" style={{ display: 'grid', gap: 12 }}>
                    <Skeleton width="220px" height="32px" />
                    <Skeleton height="160px" borderRadius="16px" />
                  </div>
                }
              >
                <Outlet />
              </Suspense>
            </PageContainer>
          </main>
        </div>
      </div>

      <MobileNav />
      <CommandMenu open={commandOpen} onClose={() => setCommandOpen(false)} />
    </div>
  );
}
