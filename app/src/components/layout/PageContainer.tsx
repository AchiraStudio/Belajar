import React from 'react';
import styles from './PageContainer.module.css';

export interface PageContainerProps extends React.HTMLAttributes<HTMLDivElement> {
  width?: 'narrow' | 'standard' | 'wide' | 'full';
  children: React.ReactNode;
}

export function PageContainer({
  width = 'standard',
  children,
  className = '',
  ...props
}: PageContainerProps) {
  return (
    <div
      className={`${styles.container} ${styles[width]} ${className}`.trim()}
      {...props}
    >
      {children}
    </div>
  );
}
