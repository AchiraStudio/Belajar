import React from 'react';
import styles from './ui.module.css';

export interface FrostPanelProps extends React.HTMLAttributes<HTMLDivElement> {
  elevation?: 'panel' | 'raised' | 'overlay';
  bordered?: boolean;
}

export const FrostPanel = React.forwardRef<HTMLDivElement, FrostPanelProps>(
  (
    {
      elevation = 'panel',
      bordered = true,
      children,
      className = '',
      ...props
    },
    ref,
  ) => {
    return (
      <div
        ref={ref}
        className={`
          ${styles.frostPanel}
          ${styles[elevation]}
          ${bordered ? '' : styles.unbordered}
          ${className}
        `.trim()}
        {...props}
      >
        {children}
      </div>
    );
  },
);

FrostPanel.displayName = 'FrostPanel';
