// Ported from .base-ui/packages/react/src/internals/composite/root/CompositeRootContext.ts.
// The composite (roving-focus) root context. Only the pieces the current components read
// are typed; the full surface lands with the composite navigation system (ToggleGroup /
// Toolbar / menus). Standalone button-likes call `useCompositeRootContext(true)`, which
// returns undefined when there's no <Composite.Root> ancestor.
import { createContext, useContext } from 'octane';

export interface CompositeRootContextValue {
	highlightedIndex: number;
	onHighlightedIndexChange: (index: number, shouldScrollIntoView?: boolean) => void;
	highlightItemOnHover: boolean;
	relayKeyboardEvent: (event: KeyboardEvent) => void;
}

export const CompositeRootContext = createContext<CompositeRootContextValue | undefined>(undefined);

export function useCompositeRootContext(optional: true): CompositeRootContextValue | undefined;
export function useCompositeRootContext(optional?: false): CompositeRootContextValue;
export function useCompositeRootContext(optional = false): CompositeRootContextValue | undefined {
	const context = useContext(CompositeRootContext);
	if (context === undefined && !optional) {
		throw new Error(
			'Base UI: CompositeRootContext is missing. Composite parts must be placed within <Composite.Root>.',
		);
	}
	return context;
}
