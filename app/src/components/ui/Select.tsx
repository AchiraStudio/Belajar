import React, { useId, useState } from 'react';
import { Dropdown, type DropdownOption } from './Dropdown';
import styles from './ui.module.css';

export interface SelectOption {
  value: string | number;
  label: string;
  description?: string;
  disabled?: boolean;
  /** Heading shown above the first option of a run of options with the same group. */
  group?: string;
}

/** What `onChange` receives: the part of a native change event that callers actually read. */
export interface SelectChange {
  target: { value: string; name?: string };
}

export interface SelectProps {
  label?: string;
  hint?: string;
  error?: string;
  options?: SelectOption[];
  /** `<option>` elements, for callers that list their choices inline. */
  children?: React.ReactNode;
  value?: string | number | null;
  /** Starting choice when the caller does not control `value`. */
  defaultValue?: string | number;
  onChange?: (e: SelectChange) => void;
  placeholder?: string;
  id?: string;
  name?: string;
  className?: string;
  disabled?: boolean;
  'aria-label'?: string;
}

/** Reads `<option value="x">Label</option>` children (also inside `<optgroup>`) into plain options. */
function optionsFromChildren(children: React.ReactNode, group?: string): SelectOption[] {
  const out: SelectOption[] = [];
  React.Children.forEach(children, (child) => {
    if (!React.isValidElement(child)) return;
    const props = child.props as { value?: string | number; children?: React.ReactNode; disabled?: boolean; label?: string };
    if (child.type === 'optgroup') {
      out.push(...optionsFromChildren(props.children, props.label));
    } else if (child.type === 'option') {
      const text = React.Children.toArray(props.children).join('');
      out.push({ value: props.value ?? text, label: text, disabled: props.disabled, group });
    }
  });
  return out;
}

/**
 * A labelled form field around the app's themed [`Dropdown`]. Replaces the native `<select>` (its
 * popup cannot be styled) while keeping the same props shape, so screens read as before.
 */
export function Select({
  id,
  label,
  hint,
  error,
  options,
  children,
  value,
  defaultValue,
  onChange,
  placeholder,
  name,
  className = '',
  disabled,
  'aria-label': ariaLabel,
}: SelectProps) {
  const generatedId = useId();
  const selectId = id ?? generatedId;
  const errorId = error ? `${selectId}-error` : undefined;
  const hintId = hint ? `${selectId}-hint` : undefined;
  const items: DropdownOption[] = options ?? optionsFromChildren(children);
  const [own, setOwn] = useState<string | number | undefined>(defaultValue);
  const current = value !== undefined ? value : own;

  return (
    <div className={styles.fieldWrapper}>
      {label && (
        <label htmlFor={selectId} className={styles.label}>
          {label}
        </label>
      )}
      <Dropdown
        id={selectId}
        name={name}
        value={current}
        options={items}
        placeholder={placeholder}
        disabled={disabled}
        aria-label={label ? undefined : ariaLabel}
        aria-invalid={Boolean(error)}
        aria-describedby={errorId ?? hintId}
        className={className}
        onChange={(v) => {
          setOwn(v);
          onChange?.({ target: { value: v, name } });
        }}
      />
      {error && (
        <p id={errorId} role="alert" className={styles.error}>
          {error}
        </p>
      )}
      {!error && hint && (
        <p id={hintId} className={styles.hint}>
          {hint}
        </p>
      )}
    </div>
  );
}
