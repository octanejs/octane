import { createContext, createElement, useContext, useMemo } from 'octane';
import type { LucideContext, LucideProps } from './types';

const CONTEXT_MEMO_SLOT = Symbol.for('@octanejs/lucide:LucideProvider:value');

const LucideContextObject = createContext<LucideContext>({});

export interface LucideProviderProps extends LucideProps {
	children?: unknown;
}

export function LucideProvider({
	children,
	size,
	color,
	strokeWidth,
	absoluteStrokeWidth,
	className,
}: LucideProviderProps) {
	const value = useMemo(
		() => ({ size, color, strokeWidth, absoluteStrokeWidth, className }),
		[size, color, strokeWidth, absoluteStrokeWidth, className],
		CONTEXT_MEMO_SLOT,
	);
	return createElement(LucideContextObject.Provider, { value, children });
}

export function useLucideContext(): LucideContext {
	return useContext(LucideContextObject);
}
