import React, { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Icon, type IconName } from './Icon';
import styles from './Dropdown.module.css';

export interface DropdownOption {
  value: string | number;
  label: string;
  /** A second, quieter line under the label. */
  description?: string;
  icon?: IconName;
  disabled?: boolean;
  /** Heading shown above the first option of a run of options with the same group. */
  group?: string;
}

export interface DropdownProps {
  value: string | number | null | undefined;
  options: DropdownOption[];
  onChange: (value: string) => void;
  /** Shown while nothing is selected. */
  placeholder?: string;
  id?: string;
  name?: string;
  disabled?: boolean;
  /** Accessible name when there is no visible `<label htmlFor>`. */
  'aria-label'?: string;
  'aria-describedby'?: string;
  'aria-invalid'?: boolean;
  className?: string;
  /** `sm` is for toolbars, `md` for forms. */
  size?: 'sm' | 'md';
  /** Stretch to the container (default) or hug the content. */
  fit?: 'fill' | 'content';
}

interface Placement {
  top?: number;
  bottom?: number;
  left: number;
  minWidth: number;
  maxHeight: number;
}

const GAP = 6;
const EDGE = 8;
const MAX_LIST = 320;

/**
 * The app's one dropdown: a themed button plus a listbox popover, used everywhere instead of the
 * browser's native `<select>` (whose popup cannot be styled and looks out of place on both desktop
 * and Android). Combobox pattern: focus stays on the button, arrow keys move the highlight,
 * Enter/Space choose, Escape closes, typing jumps to a match.
 */
export function Dropdown({
  value,
  options,
  onChange,
  placeholder,
  id,
  name,
  disabled,
  className = '',
  size = 'md',
  fit = 'fill',
  ...aria
}: DropdownProps) {
  const generatedId = useId();
  const triggerId = id ?? `${generatedId}-trigger`;
  const listId = `${generatedId}-list`;
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const typed = useRef({ text: '', at: 0 });

  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [placement, setPlacement] = useState<Placement | null>(null);

  const selectedIndex = useMemo(() => options.findIndex((o) => String(o.value) === String(value ?? '')), [options, value]);
  const selected = selectedIndex >= 0 ? options[selectedIndex] : undefined;

  const enabled = useCallback((i: number) => i >= 0 && i < options.length && !options[i]!.disabled, [options]);
  const firstEnabled = useCallback(() => options.findIndex((o) => !o.disabled), [options]);
  const lastEnabled = useCallback(() => {
    for (let i = options.length - 1; i >= 0; i -= 1) if (!options[i]!.disabled) return i;
    return -1;
  }, [options]);
  const step = useCallback(
    (from: number, dir: 1 | -1) => {
      for (let i = from + dir; i >= 0 && i < options.length; i += dir) if (enabled(i)) return i;
      return from;
    },
    [enabled, options.length],
  );

  const close = useCallback((refocus: boolean) => {
    setOpen(false);
    setPlacement(null);
    if (refocus) triggerRef.current?.focus();
  }, []);

  const openList = useCallback(() => {
    if (disabled || options.length === 0) return;
    setActive(selectedIndex >= 0 && enabled(selectedIndex) ? selectedIndex : firstEnabled());
    setOpen(true);
  }, [disabled, enabled, firstEnabled, options.length, selectedIndex]);

  const choose = useCallback(
    (i: number) => {
      if (!enabled(i)) return;
      onChange(String(options[i]!.value));
      close(true);
    },
    [close, enabled, onChange, options],
  );

  // Place the list under the button, or above it when there is more room there. Measured after the
  // list renders (its height is not known before) and before paint, so it never flashes elsewhere.
  useLayoutEffect(() => {
    if (!open) return;
    const trigger = triggerRef.current;
    const list = listRef.current;
    if (!trigger || !list) return;
    const r = trigger.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const wanted = Math.min(list.scrollHeight, MAX_LIST);
    const below = vh - r.bottom - GAP - EDGE;
    const above = r.top - GAP - EDGE;
    const up = wanted > below && above > below;
    const width = Math.max(r.width, list.offsetWidth);
    const left = Math.min(Math.max(EDGE, r.left), Math.max(EDGE, vw - width - EDGE));
    setPlacement(
      up
        ? { bottom: vh - r.top + GAP, left, minWidth: r.width, maxHeight: Math.min(MAX_LIST, above) }
        : { top: r.bottom + GAP, left, minWidth: r.width, maxHeight: Math.min(MAX_LIST, below) },
    );
  }, [open, options]);

  // Keep the highlighted row in view while arrowing through a long list.
  useEffect(() => {
    if (!open || active < 0) return;
    listRef.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)?.scrollIntoView?.({ block: 'nearest' });
  }, [open, active]);

  // Outside press, scroll of the page behind, and resizing all dismiss the list.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      const node = e.target as Node;
      if (listRef.current?.contains(node) || triggerRef.current?.contains(node)) return;
      close(false);
    };
    const onScroll = (e: Event) => {
      if (listRef.current?.contains(e.target as Node)) return;
      close(false);
    };
    const onResize = () => close(false);
    document.addEventListener('pointerdown', onPointerDown, true);
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onResize);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true);
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onResize);
    };
  }, [open, close]);

  const onKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    if (disabled) return;
    if (!open) {
      if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(e.key)) {
        e.preventDefault();
        openList();
      }
      return;
    }
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setActive((a) => (a < 0 ? firstEnabled() : step(a, 1)));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setActive((a) => (a < 0 ? lastEnabled() : step(a, -1)));
        break;
      case 'Home':
        e.preventDefault();
        setActive(firstEnabled());
        break;
      case 'End':
        e.preventDefault();
        setActive(lastEnabled());
        break;
      case 'Enter':
      case ' ':
        e.preventDefault();
        choose(active);
        break;
      case 'Escape':
        e.preventDefault();
        e.stopPropagation();
        close(true);
        break;
      case 'Tab':
        close(false);
        break;
      default: {
        // Type-ahead: "ma" jumps to the first option starting with "ma".
        if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
          const now = Date.now();
          const t = typed.current;
          t.text = now - t.at > 700 ? e.key.toLowerCase() : t.text + e.key.toLowerCase();
          t.at = now;
          const from = Math.max(active, 0);
          const order = [...options.keys()].map((_, k) => (from + 1 + k) % options.length);
          const hit = (t.text.length > 1 ? [active, ...order] : order).find((i) => enabled(i) && options[i]!.label.toLowerCase().startsWith(t.text));
          if (hit !== undefined && hit >= 0) setActive(hit);
        }
      }
    }
  };

  const activeId = open && active >= 0 ? `${listId}-${active}` : undefined;

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        id={triggerId}
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-activedescendant={activeId}
        aria-label={aria['aria-label']}
        aria-describedby={aria['aria-describedby']}
        aria-invalid={aria['aria-invalid']}
        disabled={disabled}
        data-size={size}
        data-fit={fit}
        data-open={open || undefined}
        className={`${styles.trigger} ${className}`.trim()}
        onClick={() => (open ? close(false) : openList())}
        onKeyDown={onKeyDown}
      >
        {selected?.icon && <Icon name={selected.icon} size={size === 'sm' ? 15 : 17} />}
        <span className={selected ? styles.value : styles.placeholder}>{selected ? selected.label : (placeholder ?? '')}</span>
        <Icon name="chevron-down" size={16} />
      </button>
      {name && <input type="hidden" name={name} value={value == null ? '' : String(value)} />}

      {open &&
        createPortal(
          <ul
            ref={listRef}
            id={listId}
            role="listbox"
            aria-labelledby={triggerId}
            className={styles.list}
            data-placed={placement ? '' : undefined}
            style={placement ?? { visibility: 'hidden', top: 0, left: 0 }}
          >
            {options.map((o, i) => {
              const isSelected = i === selectedIndex;
              const heading = o.group && o.group !== options[i - 1]?.group ? o.group : null;
              return (
                <React.Fragment key={String(o.value)}>
                {heading && (
                  <li role="presentation" className={styles.groupLabel}>
                    {heading}
                  </li>
                )}
                <li
                  id={`${listId}-${i}`}
                  role="option"
                  data-index={i}
                  aria-selected={isSelected}
                  aria-disabled={o.disabled || undefined}
                  data-active={i === active || undefined}
                  className={styles.option}
                  onPointerMove={() => i !== active && enabled(i) && setActive(i)}
                  // mousedown, not click: the button must not lose focus before the choice lands.
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => choose(i)}
                >
                  {o.icon && <Icon name={o.icon} size={17} />}
                  <span className={styles.optionText}>
                    <span className={styles.optionLabel}>{o.label}</span>
                    {o.description && <span className={styles.optionDesc}>{o.description}</span>}
                  </span>
                  {isSelected && <Icon name="check" size={16} />}
                </li>
                </React.Fragment>
              );
            })}
          </ul>,
          document.body,
        )}
    </>
  );
}
