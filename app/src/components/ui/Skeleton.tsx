import React from 'react';
import styles from './ui.module.css';

export interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
  width?: string | number;
  height?: string | number;
  circle?: boolean;
  borderRadius?: string;
}

export function Skeleton({
  width = '100%',
  height = '1rem',
  circle = false,
  borderRadius,
  className = '',
  style,
  ...props
}: SkeletonProps) {
  const customStyle: React.CSSProperties = {
    width,
    height: circle && !height ? width : height,
    borderRadius: circle ? '50%' : borderRadius,
    ...style,
  };

  return (
    <div
      aria-busy="true"
      aria-hidden="true"
      className={`${styles.skeleton} ${circle ? styles.circle : ''} ${className}`.trim()}
      style={customStyle}
      {...props}
    />
  );
}
