import React, { Suspense, useEffect, useState } from 'react';
import { Outlet, useLocation } from 'react-router';
import { CommandMenu } from './CommandMenu';
import { Dock } from './Dock';
import { GlobalContextMenu } from './GlobalContextMenu';
import { PageContainer } from './PageContainer';
import { RouteErrorBoundary } from './RouteErrorBoundary';
import { TopBar } from './TopBar';
import { useDesktopWindow } from './windowChrome';
import { useMediaQuery } from '../../hooks/useMediaQuery';
import { useI18n } from '../../services/i18n';
import { Skeleton } from '../ui/Skeleton';
import styles from './AppShell.module.css';

export function AppShell() {
  const [commandOpen, setCommandOpen] = useState(false);
  const location = useLocation();
  const { t } = useI18n();
  const compact = useMediaQuery('(max-width: 768px)');
  const desktopWindow = useDesktopWindow();

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
        {t('Langsung ke isi halaman')}
      </a>

      {/* A phone has no top bar; a narrow desktop window keeps a slim one, since it is also the title bar. */}
      {(!compact || desktopWindow) && <TopBar compact={compact} onSearchClick={() => setCommandOpen(true)} />}

      <main id="view" className={styles.mainContent} tabIndex={-1}>
        <PageContainer width="wide">
          <Suspense
            fallback={
              <div aria-busy="true" aria-label={t('Memuat halaman')} style={{ display: 'grid', gap: 12 }}>
                <Skeleton width="220px" height="32px" />
                <Skeleton height="160px" borderRadius="16px" />
              </div>
            }
          >
            <RouteErrorBoundary resetKey={location.pathname}>
              <Outlet />
            </RouteErrorBoundary>
          </Suspense>
        </PageContainer>
      </main>

      <Dock onSearch={() => setCommandOpen(true)} />
      <CommandMenu open={commandOpen} onClose={() => setCommandOpen(false)} />
      <GlobalContextMenu onSearch={() => setCommandOpen(true)} />
    </div>
  );
}
