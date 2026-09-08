/** @jsxImportSource octane */
'use client';
import * as React from 'octane';

/**
 * Holds the provider's `delay` value. `closeDelay` is handled by the delay group.
 */
export const TooltipProviderContext = React.createContext<number | undefined>(undefined);

export function useTooltipProviderContext(): number | undefined {
	return React.useContext(TooltipProviderContext);
}
