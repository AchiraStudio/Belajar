import React from 'react';
import { Icon, type IconName } from './Icon';
import styles from './ui.module.css';

export interface IconButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  icon: IconName;
  label: string;
  tooltip?: string;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
}

export const IconButton = React.forwardRef<HTMLButtonElement, IconButtonProps>(
  (
    {
      icon,
      label,
      tooltip,
      variant = 'ghost',
      size = 'md',
      disabled = false,
      className = '',
      type = 'button',
      ...props
    },
    ref,
  ) => {
    const iconSize = size === 'sm' ? 16 : size === 'lg' ? 22 : 18;

    return (
      <button
        ref={ref}
        type={type}
        disabled={disabled}
        aria-label={label}
        title={tooltip ?? label}
        className={`
          ${styles.iconButton}
          ${styles[variant]}
          ${styles[size]}
          ${className}
        `.trim()}
        {...props}
      >
        <Icon name={icon} size={iconSize} aria-hidden="true" />
      </button>
    );
  },
);

IconButton.displayName = 'IconButton';
