import React, { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Icon, type IconName } from './Icon';
import styles from './ContextMenu.module.css';

export type MenuEntry =
  | {
      type?: 'item';
      id: string;
      label: string;
      icon?: IconName;
      /** Shown on the right, e.g. "Ctrl C". Purely a hint: the shortcut itself is the browser's. */
      shortcut?: string;
      disabled?: boolean;
      danger?: boolean;
      onSelect: () => void;
    }
  | { type: 'separator'; id: string };

export interface ContextMenuProps {
  /** Where the pointer was (viewport coordinates). */
  x: number;
  y: number;
  entries: MenuEntry[];
  onClose: () => void;
  label?: string;
}

const EDGE = 8;

/**
 * A themed menu opened at a point, for right clicks. Arrow keys move, Enter/Space choose, Escape
 * closes, and it keeps itself inside the window. It closes on any outside press, scroll, resize or
 * focus loss, like a native menu.
 */
export function ContextMenu({ x, y, entries, onClose, label }: ContextMenuProps) {
  const id = useId();
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const items = entries.filter((e): e is Extract<MenuEntry, { id: string; label: string }> => e.type !== 'separator');
  const firstEnabled = items.findIndex((e) => !e.disabled);
  const [active, setActive] = useState(firstEnabled);

  // Measure, then flip/clamp so the menu never runs off the window.
  useLayoutEffect(() => {
    const node = ref.current;
    if (!node) return;
    const w = node.offsetWidth;
    const h = node.offsetHeight;
    const left = Math.max(EDGE, Math.min(x, window.innerWidth - w - EDGE));
    const top = Math.max(EDGE, y + h + EDGE > window.innerHeight ? y - h : y);
    setPos({ left, top: Math.max(EDGE, Math.min(top, window.innerHeight - h - EDGE)) });
  }, [x, y, entries]);

  useEffect(() => {
    ref.current?.focus({ preventScroll: true });
  }, []);

  useEffect(() => {
    const onPointerDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose();
    };
    const dismiss = () => onClose();
    document.addEventListener('pointerdown', onPointerDown, true);
    window.addEventListener('blur', dismiss);
    window.addEventListener('resize', dismiss);
    window.addEventListener('scroll', dismiss, true);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true);
      window.removeEventListener('blur', dismiss);
      window.removeEventListener('resize', dismiss);
      window.removeEventListener('scroll', dismiss, true);
    };
  }, [onClose]);

  const step = useCallback(
    (from: number, dir: 1 | -1) => {
      for (let i = from + dir; i >= 0 && i < items.length; i += dir) if (!items[i]!.disabled) return i;
      return from;
    },
    [items],
  );

  const run = (i: number) => {
    const item = items[i];
    if (!item || item.disabled) return;
    onClose();
    // After closing, so a handler that moves focus (paste) is not fighting the menu for it.
    item.onSelect();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setActive((a) => step(a, 1));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setActive((a) => step(a, -1));
        break;
      case 'Home':
        e.preventDefault();
        setActive(firstEnabled);
        break;
      case 'End': {
        e.preventDefault();
        for (let i = items.length - 1; i >= 0; i -= 1) {
          if (!items[i]!.disabled) {
            setActive(i);
            break;
          }
        }
        break;
      }
      case 'Enter':
      case ' ':
        e.preventDefault();
        run(active);
        break;
      case 'Escape':
      case 'Tab':
        e.preventDefault();
        onClose();
        break;
    }
  };

  let index = -1;
  return createPortal(
    <div
      ref={ref}
      role="menu"
      aria-label={label}
      aria-activedescendant={active >= 0 ? `${id}-${active}` : undefined}
      tabIndex={-1}
      className={styles.menu}
      style={pos ?? { left: 0, top: 0, visibility: 'hidden' }}
      onKeyDown={onKeyDown}
      // Our own right click must not open the browser's menu on top of this one.
      onContextMenu={(e) => e.preventDefault()}
    >
      {entries.map((entry) => {
        if (entry.type === 'separator') return <div key={entry.id} role="separator" className={styles.sep} />;
        index += 1;
        const i = index;
        return (
          <div
            key={entry.id}
            id={`${id}-${i}`}
            role="menuitem"
            aria-disabled={entry.disabled || undefined}
            data-active={i === active || undefined}
            data-danger={entry.danger || undefined}
            className={styles.item}
            // mousedown, not click: keep the selection and focus of the thing that was right-clicked.
            onMouseDown={(e) => e.preventDefault()}
            onPointerMove={() => !entry.disabled && i !== active && setActive(i)}
            onClick={() => run(i)}
          >
            <span className={styles.icon}>{entry.icon && <Icon name={entry.icon} size={16} />}</span>
            <span className={styles.text}>{entry.label}</span>
            {entry.shortcut && <kbd className={styles.shortcut}>{entry.shortcut}</kbd>}
          </div>
        );
      })}
    </div>,
    document.body,
  );
}
