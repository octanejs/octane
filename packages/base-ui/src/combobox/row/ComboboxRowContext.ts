/** @jsxImportSource octane */
'use client';
import * as React from 'octane';

export const ComboboxRowContext = React.createContext(false);

export function useComboboxRowContext() {
	return React.useContext(ComboboxRowContext);
}
