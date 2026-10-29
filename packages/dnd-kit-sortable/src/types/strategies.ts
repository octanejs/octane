import type { ClientRect } from '@octanejs/dnd-kit-core';
import type { Transform } from '@octanejs/dnd-kit-utilities';

export type SortingStrategy = (args: {
	activeNodeRect: ClientRect | null;
	activeIndex: number;
	index: number;
	rects: ClientRect[];
	overIndex: number;
}) => Transform | null;
