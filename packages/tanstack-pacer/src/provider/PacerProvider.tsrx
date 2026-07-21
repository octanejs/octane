import { useMemo } from 'octane';
import type { OctaneNode } from 'octane';
import { PacerContext } from './context.ts';
import type { PacerContextValue, PacerProviderOptions } from './context.ts';

export interface PacerProviderProps {
	children: OctaneNode;
	defaultOptions?: PacerProviderOptions;
}

const DEFAULT_OPTIONS: PacerProviderOptions = {};

// PacerProvider — provides shared default options for every pacer hook family.
// It's authored in .tsrx because it's a COMPONENT that renders a context
// Provider with children (the binding's hooks stay plain TS).
export function PacerProvider({ children, defaultOptions = DEFAULT_OPTIONS }: PacerProviderProps) @{
	const contextValue: PacerContextValue = useMemo(
		() => ({
			defaultOptions,
		}),
		[defaultOptions],
	);

	<PacerContext.Provider value={contextValue}>{children}</PacerContext.Provider>
}
