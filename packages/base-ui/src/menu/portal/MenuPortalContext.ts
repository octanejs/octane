/** @jsxImportSource octane */
'use client';
import * as React from 'octane';

export const MenuPortalContext = React.createContext<boolean | undefined>(undefined);

export function useMenuPortalContext() {
	const value = React.useContext(MenuPortalContext);
	if (value === undefined) {
		throw new Error('Base UI: <Menu.Portal> is missing.');
	}
	return value;
}
