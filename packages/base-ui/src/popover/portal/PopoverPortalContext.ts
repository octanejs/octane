/** @jsxImportSource octane */
'use client';
import * as React from 'octane';

export const PopoverPortalContext = React.createContext<boolean | undefined>(undefined);

export function usePopoverPortalContext() {
	const value = React.useContext(PopoverPortalContext);
	if (value === undefined) {
		throw new Error('Base UI: <Popover.Portal> is missing.');
	}
	return value;
}
