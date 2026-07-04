// Ported from .base-ui/packages/react/src/toggle-group/ToggleGroupContext.ts. The context
// a <ToggleGroup> provides to its child <Toggle>s. `useToggleGroupContext()` defaults to
// optional (returns undefined when a Toggle is standalone). ToggleGroup itself lands in a
// later Phase-1 step; this context is the shared contract.
import { createContext, useContext } from 'octane';

import type { BaseUIChangeEventDetails } from './createChangeEventDetails';

export interface ToggleGroupContextValue<Value = any> {
	value: readonly Value[];
	setGroupValue: (
		newValue: Value,
		nextPressed: boolean,
		eventDetails: BaseUIChangeEventDetails,
	) => void;
	disabled: boolean;
	orientation: 'horizontal' | 'vertical';
	isValueInitialized: boolean;
}

export const ToggleGroupContext = createContext<ToggleGroupContextValue | undefined>(undefined);

export function useToggleGroupContext<Value = any>(
	optional = true,
): ToggleGroupContextValue<Value> | undefined {
	const context = useContext(ToggleGroupContext) as ToggleGroupContextValue<Value> | undefined;
	if (context === undefined && !optional) {
		throw new Error(
			'Base UI: ToggleGroupContext is missing. ToggleGroup parts must be placed within <ToggleGroup>.',
		);
	}
	return context;
}
