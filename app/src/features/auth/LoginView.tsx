import React, { useState } from 'react';
import { Button, Icon, Input } from '../../components/ui';
import { apiFetch, ApiError } from '../../services/api/client';
import { useI18n } from '../../services/i18n';
import styles from './Auth.module.css';

export function LoginView({ onSuccess }: { onSuccess: () => void }) {
  const { t } = useI18n();
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy || !password) return;
    setBusy(true);
    setError('');
    try {
      await apiFetch('/api/login', { method: 'POST', body: { password }, timeoutMs: 15_000 });
      setPassword('');
      onSuccess();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('Gagal masuk. Coba lagi.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className={styles.screen} aria-labelledby="login-title">
      <form className={styles.card} onSubmit={submit} noValidate>
        <span className={styles.mark} aria-hidden="true">
          <Icon name="book" size={26} />
        </span>
        <h1 id="login-title" className={styles.title}>
          {t('Masuk ke Stuby')}
        </h1>
        <p className={styles.lead}>{t('Ruang belajar pribadimu. Masukkan kata sandi untuk melanjutkan.')}</p>
        <Input
          label={t('Kata sandi')}
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          error={error || undefined}
          icon="lock"
          data-autofocus
          autoFocus
        />
        <Button type="submit" fullWidth loading={busy} disabled={!password}>
          {t('Masuk')}
        </Button>
        <p className={styles.fine}>{t('Kata sandi dikirim ke server Stuby-mu dan tidak disimpan di perangkat ini.')}</p>
      </form>
    </main>
  );
}
