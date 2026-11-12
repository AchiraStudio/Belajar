import { fireEvent, screen, within } from '@testing-library/react';

/** Opens one of the app's dropdowns (role "combobox") and chooses the option with this name. */
export function chooseOption(combobox: HTMLElement, optionName: string | RegExp): void {
  fireEvent.click(combobox);
  fireEvent.click(within(screen.getByRole('listbox')).getByRole('option', { name: optionName }));
}
