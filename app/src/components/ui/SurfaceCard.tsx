import React from 'react';
import styles from './ui.module.css';

export interface SurfaceCardProps extends React.HTMLAttributes<HTMLDivElement> {
  interactive?: boolean;
  selected?: boolean;
  padded?: boolean;
}

export const SurfaceCard = React.forwardRef<HTMLDivElement, SurfaceCardProps>(
  (
    {
      interactive = false,
      selected = false,
      padded = true,
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
          ${styles.surfaceCard}
          ${padded ? styles.padded : ''}
          ${interactive ? styles.interactive : ''}
          ${selected ? styles.selected : ''}
          ${className}
        `.trim()}
        {...props}
      >
        {children}
      </div>
    );
  },
);

SurfaceCard.displayName = 'SurfaceCard';
