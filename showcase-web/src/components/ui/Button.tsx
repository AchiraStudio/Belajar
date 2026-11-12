import type { ComponentProps, ReactNode } from 'react';
import styles from './Button.module.css';

type Variant = 'default' | 'primary' | 'ghost' | 'ink' | 'light';

interface Common {
  variant?: Variant;
  small?: boolean;
  children: ReactNode;
  className?: string;
}

type AnchorProps = Common & Omit<ComponentProps<'a'>, keyof Common> & { href: string };
type ButtonProps = Common & Omit<ComponentProps<'button'>, keyof Common> & { href?: undefined };

/** One button for the whole page: renders an <a> when it has an href, a <button> otherwise. */
export function Button(props: AnchorProps | ButtonProps) {
  const { variant = 'default', small, className, children, ...rest } = props;
  const cls = [styles.btn, styles[variant], small && styles.sm, className].filter(Boolean).join(' ');

  if (props.href !== undefined) {
    const { href, target, ...a } = rest as ComponentProps<'a'>;
    const external = target === '_blank';
    return (
      <a className={cls} href={href} target={target} rel={external ? 'noopener' : undefined} {...a}>
        {children}
      </a>
    );
  }
  const { type = 'button', ...b } = rest as ComponentProps<'button'>;
  return (
    <button className={cls} type={type} {...b}>
      {children}
    </button>
  );
}
