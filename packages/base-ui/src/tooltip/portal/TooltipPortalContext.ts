/** @jsxImportSource octane */
'use client';
import * as React from 'octane';

export const TooltipPortalContext = React.createContext<boolean | undefined>(undefined);

export function useTooltipPortalContext() {
	const value = React.useContext(TooltipPortalContext);
	if (value === undefined) {
		throw new Error('Base UI: <Tooltip.Portal> is missing.');
	}
	return value;
}
