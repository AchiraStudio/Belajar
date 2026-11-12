import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app/App';
import './styles/global.css';

const container = document.getElementById('root');
if (!container) throw new Error('#root element missing from index.html');

// `npm run dev:mock`: answer API calls with fixtures (dev only; dropped from production bundles).
if (import.meta.env.MODE === 'mock') {
  const { installMockApi } = await import('./dev/mockApi');
  installMockApi();
}

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
