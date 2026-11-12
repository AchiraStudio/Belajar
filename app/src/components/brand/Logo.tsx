import React from 'react';
import styles from './Logo.module.css';

/**
 * The Stuby panda. `mark` is the panda with its bamboo S (square-ish, no lettering); `full` adds the
 * STUBY wordmark. Both are one flat SVG each (public/brand), so they scale cleanly and need no font.
 *
 * The artwork has black outlines, which vanish on a dark page, so `tile` seats it on a cream rounded
 * tile that looks the same in both themes.
 */
export function Logo({
  variant = 'mark',
  size = 32,
  tile = false,
  label,
  className = '',
}: {
  variant?: 'mark' | 'full';
  /** Height in px for `full`, edge of the tile (or height) for `mark`. */
  size?: number;
  tile?: boolean;
  /** Accessible name. Leave out when the product name is written next to the logo. */
  label?: string;
  className?: string;
}) {
  const img = (
    <img
      className={styles.img}
      src={`/brand/stuby-${variant}.svg`}
      alt={label ?? ''}
      aria-hidden={label ? undefined : true}
      draggable={false}
      style={tile ? undefined : { height: size }}
    />
  );
  if (!tile) return React.cloneElement(img, { className: `${styles.img} ${className}`.trim() });
  return (
    <span className={`${styles.tile} ${className}`.trim()} style={{ width: size, height: size }}>
      {img}
    </span>
  );
}
