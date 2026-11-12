import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import React, { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Dropdown } from './Dropdown';
import { Select } from './Select';

const OPTIONS = [
  { value: 'a', label: 'Apel' },
  { value: 'b', label: 'Buah naga' },
  { value: 'c', label: 'Ceri', disabled: true },
  { value: 'd', label: 'Durian' },
];

function Harness({ onChange = () => {} }: { onChange?: (v: string) => void }) {
  const [value, setValue] = useState('a');
  return (
    <Dropdown
      aria-label="Buah"
      value={value}
      options={OPTIONS}
      onChange={(v) => {
        setValue(v);
        onChange(v);
      }}
    />
  );
}

afterEach(cleanup);

describe('Dropdown', () => {
  it('shows the selected label and opens a listbox of options', () => {
    render(<Harness />);
    const trigger = screen.getByRole('combobox', { name: 'Buah' });
    expect(trigger.textContent).toContain('Apel');
    expect(screen.queryByRole('listbox')).toBeNull();

    fireEvent.click(trigger);
    const list = screen.getByRole('listbox');
    expect(within(list).getAllByRole('option')).toHaveLength(4);
    expect(within(list).getByRole('option', { name: /Apel/ }).getAttribute('aria-selected')).toBe('true');
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
  });

  it('chooses with a click and closes', () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    fireEvent.click(screen.getByRole('combobox'));
    fireEvent.click(screen.getByRole('option', { name: 'Buah naga' }));
    expect(onChange).toHaveBeenCalledWith('b');
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(screen.getByRole('combobox').textContent).toContain('Buah naga');
  });

  it('does not choose a disabled option', () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    fireEvent.click(screen.getByRole('combobox'));
    fireEvent.click(screen.getByRole('option', { name: 'Ceri' }));
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByRole('listbox')).toBeTruthy();
  });

  it('works from the keyboard: arrows skip disabled rows, Enter chooses, Escape closes', () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    const trigger = screen.getByRole('combobox');
    trigger.focus();

    fireEvent.keyDown(trigger, { key: 'ArrowDown' }); // opens on the current choice (Apel)
    expect(screen.getByRole('listbox')).toBeTruthy();
    fireEvent.keyDown(trigger, { key: 'ArrowDown' }); // Buah naga
    fireEvent.keyDown(trigger, { key: 'ArrowDown' }); // skips the disabled Ceri -> Durian
    fireEvent.keyDown(trigger, { key: 'Enter' });
    expect(onChange).toHaveBeenCalledWith('d');
    expect(screen.queryByRole('listbox')).toBeNull();

    fireEvent.keyDown(trigger, { key: 'ArrowDown' });
    expect(screen.getByRole('listbox')).toBeTruthy();
    fireEvent.keyDown(trigger, { key: 'Escape' });
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it('jumps to a match when typing', () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    const trigger = screen.getByRole('combobox');
    fireEvent.keyDown(trigger, { key: 'Enter' });
    fireEvent.keyDown(trigger, { key: 'd' });
    fireEvent.keyDown(trigger, { key: 'Enter' });
    expect(onChange).toHaveBeenCalledWith('d');
  });

  it('closes on an outside press', () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole('combobox'));
    expect(screen.getByRole('listbox')).toBeTruthy();
    fireEvent.pointerDown(document.body);
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('does not open when disabled', () => {
    render(<Dropdown aria-label="Buah" value="a" options={OPTIONS} onChange={() => {}} disabled />);
    fireEvent.click(screen.getByRole('combobox'));
    expect(screen.queryByRole('listbox')).toBeNull();
  });
});

describe('Select (field around the dropdown)', () => {
  it('is named by its label and reports changes like a native select', () => {
    const onChange = vi.fn();
    render(<Select label="Mata pelajaran" value="a" options={OPTIONS} onChange={onChange} />);
    fireEvent.click(screen.getByRole('combobox', { name: 'Mata pelajaran' }));
    fireEvent.click(screen.getByRole('option', { name: 'Durian' }));
    expect(onChange).toHaveBeenCalledWith({ target: { value: 'd', name: undefined } });
  });

  it('reads <option> children and supports an uncontrolled default', () => {
    render(
      <Select label="Gaya" defaultValue="y">
        <option value="x">Ringkas</option>
        <option value="y">Lengkap</option>
      </Select>,
    );
    const trigger = screen.getByRole('combobox', { name: 'Gaya' });
    expect(trigger.textContent).toContain('Lengkap');
    fireEvent.click(trigger);
    fireEvent.click(screen.getByRole('option', { name: 'Ringkas' }));
    expect(trigger.textContent).toContain('Ringkas');
  });

  it('shows an error with role alert', () => {
    render(<Select label="Gaya" value="a" options={OPTIONS} error="Wajib dipilih" />);
    expect(screen.getByRole('alert').textContent).toBe('Wajib dipilih');
  });
});
