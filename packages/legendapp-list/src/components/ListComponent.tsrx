import {
	type ComponentType,
	type OctaneElement,
	type Ref,
	useCallback,
	useLayoutEffect,
} from 'octane';

import { Containers } from './Containers.tsrx';
import { DevNumbers } from './DevNumbers.tsrx';
import { ListComponentScrollView } from './ListComponentScrollView.tsrx';
import { getAutoOtherAxisStyle } from './listComponentStyles.ts';
import { ScrollAdjust } from './ScrollAdjust.tsrx';
import { SnapWrapper } from './SnapWrapper.tsrx';
import { ENABLE_DEVMODE } from '../constants.ts';
import { doMaintainScrollAtEnd } from '../core/doMaintainScrollAtEnd.ts';
import type { ScrollAdjustHandler } from '../core/ScrollAdjustHandler.ts';
import { setFooterSize, setHeaderSize } from '../core/updateContentMetrics.ts';
import { useStableRenderComponent } from '../hooks/useStableRenderComponent.ts';
import { LayoutView } from '../platform/LayoutView.tsrx';
import { Platform } from '../platform/Platform.ts';
import { StyleSheet } from '../platform/StyleSheet.ts';
import type {
	LayoutChangeEvent,
	LayoutRectangle,
	LooseScrollView,
	LooseScrollViewProps,
	NativeScrollEvent,
	NativeSyntheticEvent,
	ViewStyle,
} from '../platform/scrollview-types.ts';
import { View } from '../platform/ViewComponents.tsrx';
import { useArr$, useStateContext } from '../state/state.ts';
import { type GetRenderedItem, type LegendListPropsBase, typedMemo } from '../types.internal.ts';
import { IS_DEV } from '../utils/devEnvironment.ts';
import { getComponent } from '../utils/getComponent.ts';
import { extractPadding } from '../utils/helpers.ts';
import { isHorizontalRTL } from '../utils/rtl.ts';

interface ListComponentProps<ItemT> extends Omit<
	LegendListPropsBase<ItemT, LooseScrollViewProps> & { scrollEventThrottle: number | undefined },
	| 'data'
	| 'estimatedItemSize'
	| 'drawDistance'
	| 'maintainScrollAtEnd'
	| 'maintainScrollAtEndThreshold'
	| 'maintainVisibleContentPosition'
	| 'refScrollView'
	| 'renderScrollComponent'
	| 'style'
> {
	horizontal: boolean;
	initialContentOffset: number | undefined;
	freshDataTransitionEpoch: number;
	refScrollView: Ref<LooseScrollView | null>;
	getRenderedItem: GetRenderedItem;
	onScroll: (event: NativeSyntheticEvent<NativeScrollEvent>) => void;
	onLayout: (event: LayoutChangeEvent) => void;
	onLayoutFooter?: (rect: LayoutRectangle, fromLayoutEffect: boolean) => void;
	onInternalScrollBeginDrag?: (event: NativeSyntheticEvent<NativeScrollEvent>) => void;
	onInternalScrollEnd?: () => void;
	renderScrollComponent?: (props: LooseScrollViewProps) => OctaneElement | null;
	style: ViewStyle;
	canRender: boolean;
	scrollAdjustHandler: ScrollAdjustHandler;
	snapToIndices: number[] | undefined;
	stickyHeaderIndices: number[] | undefined;
	useWindowScroll?: boolean;
}

// biome-ignore lint/nursery/noShadow: const function name shadowing is intentional
const AlignItemsAtEndSpacer = typedMemo(function AlignItemsAtEndSpacer({
	horizontal,
}: {
	horizontal: boolean;
}) {
	const [alignItemsAtEndPadding = 0] = useArr$(['alignItemsAtEndPadding']);

	if (alignItemsAtEndPadding <= 0) {
		return null;
	}

	return (
		<View
			style={
				horizontal
					? { flexShrink: 0, width: alignItemsAtEndPadding }
					: { flexShrink: 0, height: alignItemsAtEndPadding }
			}
		>
			{null}
		</View>
	);
});

// biome-ignore lint/nursery/noShadow: const function name shadowing is intentional
export const ListComponent = typedMemo(function ListComponent<ItemT>({
	canRender,
	freshDataTransitionEpoch,
	style,
	contentContainerStyle,
	horizontal,
	initialContentOffset,
	recycleItems,
	ItemSeparatorComponent,
	alignItemsAtEnd: _alignItemsAtEnd,
	onScroll,
	onLayout,
	ListHeaderComponent,
	ListHeaderComponentStyle,
	ListFooterComponent,
	ListFooterComponentStyle,
	ListEmptyComponent,
	getRenderedItem,
	refScrollView,
	renderScrollComponent,
	onLayoutFooter,
	onInternalScrollBeginDrag,
	onInternalScrollEnd,
	scrollAdjustHandler,
	snapToIndices,
	stickyHeaderConfig,
	stickyHeaderIndices,
	useWindowScroll = false,
	...rest
}: ListComponentProps<ItemT>) {
	const ctx = useStateContext();
	const maintainVisibleContentPosition = ctx.state.props.maintainVisibleContentPosition;
	const [anchoredEndSpaceSize = 0, otherAxisSize = 0] = useArr$([
		'anchoredEndSpaceSize',
		'otherAxisSize',
	]);
	const shouldRenderAlignItemsAtEndSpacer = ctx.state.props.alignItemsAtEndPaddingEnabled;
	const shouldMaterializeAnchoredEndSpace =
		!!ctx.state.props.anchoredEndSpace &&
		ctx.state.props.anchoredEndSpaceOwner === 'list' &&
		anchoredEndSpaceSize > 0;
	let anchoredEndSpaceStyle: ViewStyle | undefined;
	if (shouldMaterializeAnchoredEndSpace) {
		const paddingEnd = horizontal ? (isHorizontalRTL(ctx.state) ? 'Left' : 'Right') : 'Bottom';
		const flattenedContentContainerStyle = StyleSheet.flatten(contentContainerStyle) as
			ViewStyle | undefined;
		anchoredEndSpaceStyle = {
			[`padding${paddingEnd}`]:
				extractPadding({}, flattenedContentContainerStyle || {}, paddingEnd) + anchoredEndSpaceSize,
		};
	}
	const autoOtherAxisStyle = getAutoOtherAxisStyle({
		horizontal,
		needsOtherAxisSize: ctx.state.needsOtherAxisSize,
		otherAxisSize,
	});

	const CustomScrollComponent = useStableRenderComponent<
		LooseScrollViewProps,
		LooseScrollViewProps,
		LooseScrollView
	>(
		renderScrollComponent,
		(props: LooseScrollViewProps, ref) => ({ ...props, ref }) as LooseScrollViewProps,
	);

	// Use renderScrollComponent if provided, otherwise a regular ScrollView
	const ScrollComponent = renderScrollComponent ? CustomScrollComponent : ListComponentScrollView;

	const SnapOrScroll: ComponentType<any> = snapToIndices
		? SnapWrapper
		: (ScrollComponent as ComponentType<any>);

	const updateFooterSize = useCallback(
		(size: number, afterSizeUpdate?: () => void) => {
			const didFooterSizeChange = setFooterSize(ctx, size);
			afterSizeUpdate?.();

			if (didFooterSizeChange && ctx.state.props.maintainScrollAtEnd?.onFooterLayout) {
				doMaintainScrollAtEnd(ctx);
			}
		},
		[ctx],
	);

	useLayoutEffect(() => {
		// Handle header/footer getting toggled on and off, remove header/footer size when they are not present
		if (!ListHeaderComponent) {
			setHeaderSize(ctx, 0);
		}
		if (!ListFooterComponent) {
			updateFooterSize(0);
		}
	}, [ListHeaderComponent, ListFooterComponent, ctx, updateFooterSize]);

	const onLayoutHeader = useCallback(
		(rect: LayoutRectangle) => {
			const size = rect[horizontal ? 'width' : 'height'];
			setHeaderSize(ctx, size);
		},
		[ctx, horizontal],
	);

	const onLayoutFooterInternal = useCallback(
		(rect: LayoutRectangle, fromLayoutEffect: boolean) => {
			const size = rect[horizontal ? 'width' : 'height'];
			updateFooterSize(size, () => {
				onLayoutFooter?.(rect, fromLayoutEffect);
			});
		},
		[horizontal, onLayoutFooter, updateFooterSize],
	);

	return (
		<SnapOrScroll
			{...rest}
			{...(Platform.OS === 'web'
				? ScrollComponent === ListComponentScrollView
					? { onInternalScrollEnd, useWindowScroll }
					: {}
				: { onScrollBeginDrag: onInternalScrollBeginDrag })}
			contentContainerStyle={[
				horizontal ? { height: '100%' } : {},
				contentContainerStyle,
				anchoredEndSpaceStyle,
				Platform.OS === 'web' ? { boxSizing: 'border-box' } : undefined,
			]}
			contentOffset={
				initialContentOffset !== undefined
					? horizontal
						? { x: initialContentOffset, y: 0 }
						: { x: 0, y: initialContentOffset }
					: undefined
			}
			horizontal={horizontal}
			maintainVisibleContentPosition={
				maintainVisibleContentPosition.size || maintainVisibleContentPosition.data
					? { minIndexForVisible: 0 }
					: undefined
			}
			onLayout={onLayout}
			onScroll={onScroll}
			ref={refScrollView as any}
			ScrollComponent={snapToIndices ? ScrollComponent : (undefined as any)}
			style={autoOtherAxisStyle ? [autoOtherAxisStyle, style] : style}
		>
			<ScrollAdjust />
			@if (ListHeaderComponent) {
				<LayoutView onLayoutChange={onLayoutHeader} style={ListHeaderComponentStyle}>
					{getComponent(ListHeaderComponent)}
				</LayoutView>
			}
			@if (ListEmptyComponent) {
				<>{getComponent(ListEmptyComponent)}</>
			}
			@if (shouldRenderAlignItemsAtEndSpacer) {
				<AlignItemsAtEndSpacer horizontal={horizontal} />
			}

			@if (canRender && !ListEmptyComponent) {
				<Containers
					freshDataTransitionEpoch={freshDataTransitionEpoch}
					getRenderedItem={getRenderedItem}
					horizontal={horizontal!}
					ItemSeparatorComponent={ItemSeparatorComponent}
					recycleItems={recycleItems!}
					stickyHeaderConfig={stickyHeaderConfig}
				/>
			}
			@if (ListFooterComponent) {
				<LayoutView onLayoutChange={onLayoutFooterInternal} style={ListFooterComponentStyle}>
					{getComponent(ListFooterComponent)}
				</LayoutView>
			}
			@if (IS_DEV && ENABLE_DEVMODE) {
				<DevNumbers />
			}
		</SnapOrScroll>
	);
});
