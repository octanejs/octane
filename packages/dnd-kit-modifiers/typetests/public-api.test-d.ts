import type { Modifier } from '@octanejs/dnd-kit-core';
import {
	createSnapModifier,
	restrictToFirstScrollableAncestor,
	restrictToHorizontalAxis,
	restrictToParentElement,
	restrictToVerticalAxis,
	restrictToWindowEdges,
	snapCenterToCursor,
} from '@octanejs/dnd-kit-modifiers';
import type { Assert, Equal } from '../../../scripts/react-port/type-assertions';

type _horizontal = Assert<Equal<typeof restrictToHorizontalAxis, Modifier>>;
type _vertical = Assert<Equal<typeof restrictToVerticalAxis, Modifier>>;
type _parent = Assert<Equal<typeof restrictToParentElement, Modifier>>;
type _scrollable = Assert<Equal<typeof restrictToFirstScrollableAncestor, Modifier>>;
type _window = Assert<Equal<typeof restrictToWindowEdges, Modifier>>;
type _snapCenter = Assert<Equal<typeof snapCenterToCursor, Modifier>>;
type _snapGrid = Assert<Equal<typeof createSnapModifier, (gridSize: number) => Modifier>>;

// @ts-expect-error grid sizes are numbers
createSnapModifier('25');
