import { HashRouter } from 'react-router';
import { AppRoutes } from './router';

// HashRouter keeps the existing `#/...` links working and needs no server fallback, which also
// suits Tauri's custom origin (ADR-6).
export function App() {
  return (
    <HashRouter>
      <AppRoutes />
    </HashRouter>
  );
}
