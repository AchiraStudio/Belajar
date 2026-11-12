import { tr } from '../../services/i18n';
import React from 'react';
import { Link } from 'react-router';
import { ErrorState } from '../ui/ErrorState';

interface Props {
  /** Changing this (the current path) clears a previous error, so navigating away recovers. */
  resetKey: string;
  children: React.ReactNode;
}

interface State {
  error: Error | null;
  resetKey: string;
}

/**
 * Keeps one broken page from blanking the whole app. Without it, an exception while rendering a
 * route unmounts everything (shell, sidebar, navigation), leaving no way to leave the page.
 * With it the shell stays up and the page shows an honest error with a way back.
 */
export class RouteErrorBoundary extends React.Component<Props, State> {
  override state: State = { error: null, resetKey: this.props.resetKey };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  static getDerivedStateFromProps(props: Props, state: State): Partial<State> | null {
    return props.resetKey !== state.resetKey ? { error: null, resetKey: props.resetKey } : null;
  }

  override componentDidCatch(error: Error, info: React.ErrorInfo): void {
    // Visible to whoever opens the devtools; nothing is sent anywhere.
    console.error(tr('Halaman gagal ditampilkan:'), error, info.componentStack);
  }

  override render() {
    if (!this.state.error) return this.props.children;
    return (
      <div style={{ display: 'grid', gap: 12, justifyItems: 'center', paddingTop: 24 }}>
        <ErrorState
          title={tr('Halaman ini tidak bisa ditampilkan')}
          message={tr('Terjadi kesalahan saat menampilkan halaman. Data kamu aman. Coba muat ulang, atau kembali ke beranda.')}
          onRetry={() => this.setState({ error: null })}
          retryLabel={tr('Muat ulang halaman')}
        />
        <Link to="/" style={{ color: 'var(--accent)', fontWeight: 600 }}>
          {tr('Kembali ke beranda')}
        </Link>
      </div>
    );
  }
}
