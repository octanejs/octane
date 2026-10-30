import type { ComponentType, CSSProperties, OctaneNode } from 'octane';

import { ContainerLayoutCoordinator } from './ContainerLayoutCoordinator.tsrx';
import { ContainerSlot } from './ContainerSlot.tsrx';
import { useDOMOrder } from '../hooks/useDOMOrder.ts';
import { useFreshDataTransitionVisibility } from '../hooks/useFreshDataTransitionVisibility.ts';
import { useArr$, useStateContext } from '../state/state.ts';
import type { StickyHeaderConfig } from '../types.base.ts';
import { type GetRenderedItem, typedMemo } from '../types.internal.ts';
import { isHorizontalRTL } from '../utils/rtl.ts';

interface ContainersProps<ItemT> {
	freshDataTransitionEpoch: number;
	horizontal: boolean;
	recycleItems: boolean;
	ItemSeparatorComponent?: ComponentType<{ leadingItem: ItemT }>;
	getRenderedItem: GetRenderedItem;
	stickyHeaderConfig?: StickyHeaderConfig;
}

interface ContainersInnerProps {
	freshDataTransitionEpoch: number;
	horizontal: boolean;
	numColumns: number;
	children: OctaneNode;
}

// biome-ignore lint/nursery/noShadow: const function name shadowing is intentional
const ContainersInner = typedMemo(function ContainersInner({
	freshDataTransitionEpoch,
	horizontal,
	numColumns,
	children,
}: ContainersInnerProps) {
	const ctx = useStateContext();
	const columnWrapperStyle = ctx.columnWrapperStyle;
	const isHorizontalRTLList = isHorizontalRTL(ctx.state);
	const [otherAxisSize, readyToRender, totalSize] = useArr$([
		'otherAxisSize',
		'readyToRender',
		'totalSize',
	]);
	const isVisible = useFreshDataTransitionVisibility(!!readyToRender, freshDataTransitionEpoch);

	const style: CSSProperties = horizontal
		? {
				direction: isHorizontalRTLList ? 'ltr' : undefined,
				flexShrink: 0,
				minHeight: otherAxisSize,
				opacity: isVisible ? 1 : 0,
				position: 'relative',
				width: totalSize,
			}
		: {
				height: totalSize,
				minWidth: otherAxisSize,
				opacity: isVisible ? 1 : 0,
				position: 'relative',
			};

	if (!isVisible) {
		style.pointerEvents = 'none';
	}

	if (columnWrapperStyle && numColumns > 1) {
		// Extract gap properties from columnWrapperStyle if available
		const { columnGap, rowGap, gap } = columnWrapperStyle;

		const gapX = columnGap || gap || 0;
		const gapY = rowGap || gap || 0;
		if (horizontal) {
			if (gapY) {
				style.marginTop = style.marginBottom = -gapY / 2;
			}
			if (gapX) {
				style.marginRight = -gapX;
			}
		} else {
			if (gapY) {
				style.marginBottom = -gapY;
			}
		}
	}

	return (
		<div style={style}>
			<ContainerLayoutCoordinator>{children}</ContainerLayoutCoordinator>
		</div>
	);
});

// biome-ignore lint/nursery/noShadow: const function name shadowing is intentional
export const Containers = typedMemo(function Containers<ItemT>({
	freshDataTransitionEpoch,
	horizontal,
	recycleItems,
	ItemSeparatorComponent,
	getRenderedItem,
	stickyHeaderConfig,
}: ContainersProps<ItemT>) {
	const [numContainersPooled, numColumns] = useArr$(['numContainersPooled', 'numColumns']);

	// DOM reordering follows item order on web; see useDOMOrder.
	const containerIds = useDOMOrder(numContainersPooled);

	return (
		<ContainersInner
			freshDataTransitionEpoch={freshDataTransitionEpoch}
			horizontal={horizontal}
			numColumns={numColumns}
		>
			@for (const id of containerIds; key id) {
				<ContainerSlot
					getRenderedItem={getRenderedItem}
					horizontal={horizontal}
					ItemSeparatorComponent={ItemSeparatorComponent}
					id={id}
					recycleItems={recycleItems}
					// specifying inline separator makes Containers rerender on each data change
					// should we do memo of ItemSeparatorComponent?
					stickyHeaderConfig={stickyHeaderConfig}
				/>
			}
		</ContainersInner>
	);
});
