// Ported from react-aria (source: .react-spectrum/packages/react-aria/src/grid/utils.ts).
// octane adaptations: `GridState`/`IGridCollection` types come from the ported stately
// grid hooks.
import type { IGridCollection as GridCollection } from '../stately/grid/GridCollection';

import type { GridState } from '../stately/grid/useGridState';
import type { Key, KeyboardDelegate } from '@react-types/shared';

interface GridMapShared {
	keyboardDelegate: KeyboardDelegate;
	actions: {
		onRowAction?: (key: Key) => void;
		onCellAction?: (key: Key) => void;
	};
	shouldSelectOnPressUp?: boolean;
}

// Used to share:
// keyboard delegate between useGrid and useGridCell
// onRowAction/onCellAction across hooks
export const gridMap: WeakMap<
	GridState<unknown, GridCollection<unknown>>,
	GridMapShared
> = new WeakMap<GridState<unknown, GridCollection<unknown>>, GridMapShared>();
