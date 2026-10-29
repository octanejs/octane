import type { DraggableSyntheticListeners } from '@octanejs/dnd-kit-core';
import {
	SortableContext,
	arrayMove,
	defaultAnimateLayoutChanges,
	horizontalListSortingStrategy,
	sortableKeyboardCoordinates,
	useSortable,
	verticalListSortingStrategy,
	type AnimateLayoutChanges,
	type SortingStrategy,
} from '@octanejs/dnd-kit-sortable';
import type { KeyboardCoordinateGetter } from '@octanejs/dnd-kit-core';
import type { Transform } from '@octanejs/dnd-kit-utilities';
import type { Assert, Equal } from '../../../scripts/react-port/type-assertions';

const moved = arrayMove(['a', 'b', 'c'], 0, 2);
type _moved = Assert<Equal<typeof moved, string[]>>;
type _vertical = Assert<Equal<typeof verticalListSortingStrategy, SortingStrategy>>;
type _horizontal = Assert<Equal<typeof horizontalListSortingStrategy, SortingStrategy>>;
type _keyboard = Assert<Equal<typeof sortableKeyboardCoordinates, KeyboardCoordinateGetter>>;
const animate: AnimateLayoutChanges = (args) =>
	args.isSorting ? defaultAnimateLayoutChanges(args) : false;

const sortable = useSortable({ id: 'tab', animateLayoutChanges: animate });
type _transform = Assert<Equal<typeof sortable.transform, Transform | null>>;
type _transition = Assert<Equal<typeof sortable.transition, string | undefined>>;
type _listeners = Assert<Equal<typeof sortable.listeners, DraggableSyntheticListeners>>;
type _isDragging = Assert<Equal<typeof sortable.isDragging, boolean>>;
type _setNodeRef = Assert<Equal<typeof sortable.setNodeRef, (node: HTMLElement | null) => void>>;
type _items = Assert<
	Equal<
		Parameters<typeof SortableContext>[0]['items'],
		(string | number | { id: string | number })[]
	>
>;

// @ts-expect-error sortable items are identifiers or objects with an id
SortableContext({ items: [true], children: null });
