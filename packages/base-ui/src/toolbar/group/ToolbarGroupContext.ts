/** @jsxImportSource octane */
'use client';
import * as React from 'octane';

export interface ToolbarGroupContext {
	disabled: boolean;
}

export const ToolbarGroupContext = React.createContext<ToolbarGroupContext | undefined>(undefined);

export function useToolbarGroupContext(): ToolbarGroupContext | undefined {
	return React.useContext(ToolbarGroupContext);
}
