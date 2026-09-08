/** @jsxImportSource octane */
'use client';
import * as React from 'octane';

export const NavigationMenuPortalContext = React.createContext<boolean | undefined>(undefined);

export function useNavigationMenuPortalContext() {
	const value = React.useContext(NavigationMenuPortalContext);
	if (value === undefined) {
		throw new Error('Base UI: <NavigationMenu.Portal> is missing.');
	}
	return value;
}
