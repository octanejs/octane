/** @jsxImportSource octane */
'use client';
import * as React from 'octane';
import type { ToastStore } from '../store';

export type ToastContext = ToastStore;

export const ToastContext = React.createContext<ToastContext | undefined>(undefined);

export function useToastProviderContext() {
	const context = React.useContext(ToastContext);
	if (!context) {
		throw new Error('Base UI: useToastManager must be used within <Toast.Provider>.');
	}
	return context;
}
