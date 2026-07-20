// Ported from react-aria (source: .react-spectrum/packages/react-aria/src/table/useTableRowGroup.ts).
// octane adaptations: composes the ported src/grid/useGridRowGroup; the optional trailing
// slot is forwarded (uniform calling convention).
import { GridRowGroupAria, useGridRowGroup } from '../grid/useGridRowGroup';

import { restSlot } from '../internal';

export function useTableRowGroup(): GridRowGroupAria;
// Slot-threading form: sibling ported hooks pass their derived sub-slot as the trailing arg.
export function useTableRowGroup(slot: symbol | undefined): GridRowGroupAria;
export function useTableRowGroup(...args: any[]): GridRowGroupAria {
	return useGridRowGroup(restSlot(args));
}
