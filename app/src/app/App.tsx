import React from 'react';
import { HashRouter } from 'react-router';
import { ToastProvider } from '../components/ui/Toast';
import { AuthGate } from '../features/auth';
import { EnvironmentProvider } from '../services/environment/EnvironmentContext';
import { ThemeProvider } from '../services/theme/ThemeContext';
import { AppRoutes } from './router';

// HashRouter keeps the existing `#/...` links working and needs no server fallback, which also
// suits Tauri's custom origin (ADR-6).
export function App() {
  return (
    <ThemeProvider>
      <ToastProvider>
        <EnvironmentProvider>
          <AuthGate>
            <HashRouter>
              <AppRoutes />
            </HashRouter>
          </AuthGate>
        </EnvironmentProvider>
      </ToastProvider>
    </ThemeProvider>
  );
}
