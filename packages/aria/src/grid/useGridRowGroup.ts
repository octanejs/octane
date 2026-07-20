// Ported from react-aria (source: .react-spectrum/packages/react-aria/src/grid/useGridRowGroup.ts).
// octane adaptations: `DOMAttributes` is a local structural prop-bag alias. The hook
// composes no base hooks, so the optional trailing slot is accepted (uniform calling
// convention) and unused.
import { splitSlot } from '../internal';

// octane adaptation: minimal structural DOMAttributes (upstream's drags React's synthetic
// handler types along).
type DOMAttributes = Record<string, any>;

export interface GridRowGroupAria {
	/** Props for the row group element. */
	rowGroupProps: DOMAttributes;
}

/**
 * Provides the accessibility implementation for a row group in a grid.
 */
export function useGridRowGroup(): GridRowGroupAria;
// Slot-threading form: sibling ported hooks pass their derived sub-slot as the trailing arg.
export function useGridRowGroup(slot: symbol | undefined): GridRowGroupAria;
export function useGridRowGroup(...args: any[]): GridRowGroupAria {
	splitSlot(args);
	return {
		rowGroupProps: {
			role: 'rowgroup',
		},
	};
}
