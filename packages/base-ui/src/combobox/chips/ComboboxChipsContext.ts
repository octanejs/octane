/** @jsxImportSource octane */
'use client';
import * as React from 'octane';

export interface ComboboxChipsContext {
	highlightedChipIndex: number | undefined;
	setHighlightedChipIndex: React.Dispatch<React.SetStateAction<number | undefined>>;
	chipsRef: React.RefObject<Array<HTMLButtonElement | null>>;
}

export const ComboboxChipsContext = React.createContext<ComboboxChipsContext | undefined>(
	undefined,
);

export function useComboboxChipsContext() {
	return React.useContext(ComboboxChipsContext);
}
