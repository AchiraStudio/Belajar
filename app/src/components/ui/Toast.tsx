import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { Icon } from './Icon';
import styles from './ui.module.css';

export type ToastVariant = 'success' | 'error' | 'warning' | 'info';

export interface ToastItem {
  id: string;
  title?: string;
  message: string;
  variant: ToastVariant;
  duration?: number;
}

export interface ToastContextValue {
  toast: {
    (item: Omit<ToastItem, 'id'>): void;
    success: (message: string, title?: string) => void;
    error: (message: string, title?: string) => void;
    warning: (message: string, title?: string) => void;
    info: (message: string, title?: string) => void;
  };
  removeToast: (id: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const addToast = useCallback(
    (item: Omit<ToastItem, 'id'>) => {
      const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const duration = item.duration ?? 4000;

      setToasts((prev) => [...prev, { ...item, id }]);

      if (duration > 0) {
        setTimeout(() => {
          removeToast(id);
        }, duration);
      }
    },
    [removeToast],
  );

  const toastMethods = useMemo(() => {
    const fn = (item: Omit<ToastItem, 'id'>) => addToast(item);
    fn.success = (message: string, title?: string) => addToast({ message, title, variant: 'success' });
    fn.error = (message: string, title?: string) => addToast({ message, title, variant: 'error' });
    fn.warning = (message: string, title?: string) => addToast({ message, title, variant: 'warning' });
    fn.info = (message: string, title?: string) => addToast({ message, title, variant: 'info' });
    return fn;
  }, [addToast]);

  const value = useMemo(
    () => ({
      toast: toastMethods,
      removeToast,
    }),
    [toastMethods, removeToast],
  );

  const getVariantClass = (variant: ToastVariant) => {
    switch (variant) {
      case 'success':
        return styles.toastSuccess;
      case 'error':
        return styles.toastError;
      case 'warning':
        return styles.toastWarning;
      case 'info':
        return styles.toastInfo;
    }
  };

  const getVariantIcon = (variant: ToastVariant) => {
    switch (variant) {
      case 'success':
        return <Icon name="check-circle" size={18} color="var(--success)" />;
      case 'error':
        return <Icon name="alert-circle" size={18} color="var(--danger)" />;
      case 'warning':
        return <Icon name="alert-triangle" size={18} color="var(--warning)" />;
      case 'info':
        return <Icon name="info" size={18} color="var(--accent)" />;
    }
  };

  return (
    <ToastContext.Provider value={value}>
      {children}
      {toasts.length > 0 && (
        <aside
          role="region"
          aria-label="Pemberitahuan"
          aria-live="polite"
          className={styles.toastViewport}
        >
          {toasts.map((t) => (
            <div
              key={t.id}
              role="status"
              className={`${styles.toast} ${getVariantClass(t.variant)}`}
            >
              {getVariantIcon(t.variant)}
              <div className={styles.toastContent}>
                {t.title && <div className={styles.toastTitle}>{t.title}</div>}
                <div className={styles.toastMessage}>{t.message}</div>
              </div>
              <button
                type="button"
                onClick={() => removeToast(t.id)}
                className={styles.toastClose}
                aria-label="Tutup pemberitahuan"
              >
                <Icon name="x" size={16} />
              </button>
            </div>
          ))}
        </aside>
      )}
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue['toast'] {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context.toast;
}
