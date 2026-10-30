import type { ComponentType } from 'octane';

import { useIsLastItem } from '../state/ContextContainer.ts';

export interface SeparatorProps<ItemT> {
	ItemSeparatorComponent: ComponentType<{ leadingItem: ItemT }>;
	leadingItem: ItemT;
}

export function Separator<ItemT>({ ItemSeparatorComponent, leadingItem }: SeparatorProps<ItemT>) {
	const isLastItem = useIsLastItem();

	return isLastItem ? null : <ItemSeparatorComponent leadingItem={leadingItem} />;
}
