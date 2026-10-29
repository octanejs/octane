import type { UniqueIdentifier } from '@octanejs/dnd-kit-core';

export type SortableData = {
	sortable: {
		containerId: UniqueIdentifier;
		items: UniqueIdentifier[];
		index: number;
	};
};
