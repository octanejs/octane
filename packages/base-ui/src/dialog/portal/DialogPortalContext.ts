/** @jsxImportSource octane */
'use client';
import * as React from 'octane';

export const DialogPortalContext = React.createContext<boolean | undefined>(undefined);

export function useDialogPortalContext() {
	const value = React.useContext(DialogPortalContext);
	if (value === undefined) {
		throw new Error('Base UI: <Dialog.Portal> is missing.');
	}
	return value;
}
