import React, { useId } from 'react';
import { tr } from '../../services/i18n';
import { Icon, type IconName } from './Icon';
import styles from './ui.module.css';

export interface InputProps
  extends React.InputHTMLAttributes<HTMLInputElement | HTMLTextAreaElement> {
  label?: string;
  hint?: string;
  error?: string;
  icon?: IconName;
  clearable?: boolean;
  onClear?: () => void;
  multiline?: boolean;
  rows?: number;
}

export const Input = React.forwardRef<
  HTMLInputElement & HTMLTextAreaElement,
  InputProps
>(
  (
    {
      id,
      label,
      hint,
      error,
      icon,
      clearable = false,
      onClear,
      multiline = false,
      rows = 3,
      value,
      className = '',
      disabled,
      ...props
    },
    ref,
  ) => {
    const generatedId = useId();
    const inputId = id ?? generatedId;
    const errorId = error ? `${inputId}-error` : undefined;
    const hintId = hint ? `${inputId}-hint` : undefined;

    const hasValue = value !== undefined && value !== '' && value !== null;

    return (
      <div className={styles.fieldWrapper}>
        {label && (
          <label htmlFor={inputId} className={styles.label}>
            {label}
          </label>
        )}
        <div className={styles.inputContainer}>
          {icon && (
            <span className={styles.iconSlot}>
              <Icon name={icon} size={16} />
            </span>
          )}
          {multiline ? (
            <textarea
              ref={ref as any}
              id={inputId}
              rows={rows}
              value={value}
              disabled={disabled}
              aria-invalid={Boolean(error)}
              aria-describedby={errorId ?? hintId}
              className={`${styles.textarea} ${icon ? styles.inputWithIcon : ''} ${className}`.trim()}
              {...(props as React.TextareaHTMLAttributes<HTMLTextAreaElement>)}
            />
          ) : (
            <input
              ref={ref as any}
              id={inputId}
              value={value}
              disabled={disabled}
              aria-invalid={Boolean(error)}
              aria-describedby={errorId ?? hintId}
              className={`${styles.input} ${icon ? styles.inputWithIcon : ''} ${className}`.trim()}
              {...(props as React.InputHTMLAttributes<HTMLInputElement>)}
            />
          )}
          {clearable && hasValue && !disabled && (
            <button
              type="button"
              className={styles.clearButton}
              onClick={onClear}
              aria-label={tr('Hapus teks')}
            >
              <Icon name="x" size={14} />
            </button>
          )}
        </div>
        {error && (
          <p id={errorId} role="alert" className={styles.error}>
            {error}
          </p>
        )}
        {!error && hint && (
          <p id={hintId} className={styles.hint}>
            {hint}
          </p>
        )}
      </div>
    );
  },
);

Input.displayName = 'Input';
