import type { ComponentType } from 'octane';

import { Container } from './Container.tsrx';
import { useArr$ } from '../state/state.ts';
import type { StickyHeaderConfig } from '../types.base.ts';
import { type GetRenderedItem, typedMemo } from '../types.internal.ts';

export interface ContainerComponentProps<ItemT> {
	horizontal: boolean;
	id: number;
	itemKey: string;
	recycleItems: boolean;
	ItemSeparatorComponent?: ComponentType<{ leadingItem: ItemT }>;
	getRenderedItem: GetRenderedItem;
	stickyHeaderConfig?: StickyHeaderConfig;
}

export interface ContainerSlotProps<ItemT> extends Omit<ContainerComponentProps<ItemT>, 'itemKey'> {
	ContainerComponent?: ComponentType<ContainerComponentProps<ItemT>>;
}

export function ContainerSlotBase<ItemT>({
	id,
	horizontal,
	recycleItems,
	ItemSeparatorComponent,
	getRenderedItem,
	stickyHeaderConfig,
	ContainerComponent = Container,
}: ContainerSlotProps<ItemT>) {
	const [itemKey] = useArr$([`containerItemKey${id}`]);

	if (itemKey === undefined) {
		return null;
	}

	return (
		<ContainerComponent
			getRenderedItem={getRenderedItem}
			horizontal={horizontal}
			ItemSeparatorComponent={ItemSeparatorComponent}
			id={id}
			itemKey={itemKey}
			recycleItems={recycleItems}
			stickyHeaderConfig={stickyHeaderConfig}
		/>
	);
}

// biome-ignore lint/nursery/noShadow: const function name shadowing is intentional
export const ContainerSlot = typedMemo(function ContainerSlot<ItemT>(
	props: ContainerSlotProps<ItemT>,
) {
	return <ContainerSlotBase {...props} />;
});
