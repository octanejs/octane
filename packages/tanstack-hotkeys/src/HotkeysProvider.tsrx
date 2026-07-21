import { useMemo } from 'octane';
import type { OctaneNode } from 'octane';
import { HotkeysContext } from './context.ts';
import type { HotkeysContextValue, HotkeysProviderOptions } from './context.ts';

export interface HotkeysProviderProps {
	children: OctaneNode;
	defaultOptions?: HotkeysProviderOptions;
}

const DEFAULT_OPTIONS: HotkeysProviderOptions = {};

// HotkeysProvider — provides shared default options for the hotkey hooks. It's
// authored in .tsrx because it's a COMPONENT that renders a context Provider
// with children (the binding's hooks stay plain TS).
export function HotkeysProvider({
	children,
	defaultOptions = DEFAULT_OPTIONS,
}: HotkeysProviderProps) @{
	const contextValue: HotkeysContextValue = useMemo(
		() => ({
			defaultOptions,
		}),
		[defaultOptions],
	);

	<HotkeysContext.Provider value={contextValue}>{children}</HotkeysContext.Provider>
}
