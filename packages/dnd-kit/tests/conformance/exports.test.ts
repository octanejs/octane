import { describe, expect, it } from 'vitest';
import * as DndKit from '@octanejs/dnd-kit';
import * as Hooks from '@octanejs/dnd-kit/hooks';
import * as Sortable from '@octanejs/dnd-kit/sortable';
import * as Utilities from '@octanejs/dnd-kit/utilities';

describe('public entrypoints', () => {
	it('matches the modern @dnd-kit/react root runtime surface', () => {
		expect(Object.keys(DndKit).sort()).toEqual(
			[
				'DragDropProvider',
				'DragOverlay',
				'KeyboardSensor',
				'PointerSensor',
				'useDragDropManager',
				'useDragDropMonitor',
				'useDragOperation',
				'useDraggable',
				'useDroppable',
				'useInstance',
			].sort(),
		);
	});

	it('matches the hooks, sortable, and utilities subpath surfaces', () => {
		expect(Object.keys(Hooks).sort()).toEqual(
			[
				'useComputed',
				'useConstant',
				'useDeepSignal',
				'useImmediateEffect',
				'useIsomorphicLayoutEffect',
				'useLatest',
				'useOnElementChange',
				'useOnValueChange',
			].sort(),
		);
		expect(Object.keys(Sortable).sort()).toEqual(
			['isSortable', 'isSortableOperation', 'useSortable'].sort(),
		);
		expect(Object.keys(Utilities)).toEqual(['currentValue']);
	});
});
