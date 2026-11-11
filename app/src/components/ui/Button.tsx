import React from 'react';
import { Icon, type IconName } from './Icon';
import styles from './ui.module.css';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'outline';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
  icon?: IconName;
  iconPosition?: 'left' | 'right';
  fullWidth?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      variant = 'primary',
      size = 'md',
      loading = false,
      disabled = false,
      icon,
      iconPosition = 'left',
      fullWidth = false,
      children,
      className = '',
      type = 'button',
      ...props
    },
    ref,
  ) => {
    const iconSize = size === 'sm' ? 14 : size === 'lg' ? 20 : 16;
    const isDisabled = disabled || loading;

    return (
      <button
        ref={ref}
        type={type}
        disabled={isDisabled}
        aria-busy={loading ? 'true' : undefined}
        className={`
          ${styles.button}
          ${styles[variant]}
          ${styles[size]}
          ${fullWidth ? styles.fullWidth : ''}
          ${loading ? styles.loading : ''}
          ${className}
        `.trim()}
        {...props}
      >
        {loading && <span className={styles.spinner} aria-hidden="true" />}
        {!loading && icon && iconPosition === 'left' && (
          <Icon name={icon} size={iconSize} aria-hidden="true" />
        )}
        {children && <span>{children}</span>}
        {!loading && icon && iconPosition === 'right' && (
          <Icon name={icon} size={iconSize} aria-hidden="true" />
        )}
      </button>
    );
  },
);

Button.displayName = 'Button';
