import type { OctaneNode } from 'octane';
import type { Assert, Equal } from '../../../../scripts/react-port/type-assertions';
import {
	internal,
	LegendList,
	useAdaptiveRender,
	useAdaptiveRenderChange,
	useIsLastItem,
	useListScrollSize,
	useRecyclingEffect,
	useRecyclingState,
	useSyncLayout,
	useViewability,
	useViewabilityAmount,
	type AdaptiveRender,
	type AdaptiveRenderChangeReason,
	type AdaptiveRenderConfig,
	type AlwaysRenderConfig,
	type AnchoredEndSpaceConfig,
	type ColumnWrapperStyle,
	type Insets,
	type LayoutRectangle,
	type LegendListAverageItemSize,
	type LegendListComponent,
	type LegendListMetrics,
	type LegendListProps,
	type LegendListRecyclingState,
	type LegendListRef,
	type LegendListRenderItemProps,
	type LegendListState,
	type MaintainScrollAtEndOnOptions,
	type MaintainScrollAtEndOptions,
	type MaintainVisibleContentPositionConfig,
	type NativeScrollEvent,
	type NativeSyntheticEvent,
	type OnViewableItemsChanged,
	type OnViewableItemsChangedInfo,
	type ScrollIndexWithOffset,
	type ScrollIndexWithOffsetAndContentOffset,
	type ScrollIndexWithOffsetPosition,
	type StickyHeaderConfig,
	type StyleProp,
	type ViewAmountToken,
	type ViewabilityAmountCallback,
	type ViewabilityCallback,
	type ViewabilityConfig,
	type ViewabilityConfigCallbackPair,
	type ViewabilityConfigCallbackPairs,
	type ViewStyle,
	type ViewToken,
} from '@octanejs/legendapp-list';

interface Row {
	id: string;
	label: string;
}

// The component, its props and its imperative handle.
const ref: { current: LegendListRef | null } = { current: null };
const list = (
	<LegendList<Row>
		ref={ref}
		data={[{ id: 'a', label: 'A' }]}
		keyExtractor={(row) => row.id}
		renderItem={({ item, index }) => <div data-index={index}>{item.label}</div>}
		estimatedItemSize={40}
		recycleItems
		maintainScrollAtEnd={{ animated: false, on: { dataChange: true } }}
		maintainVisibleContentPosition={{ data: true, size: true }}
		anchoredEndSpace={{ anchorIndex: 0, anchorOffset: 8 }}
		alwaysRender={{ indices: [0] }}
		className="timeline"
	/>
);
// @ts-expect-error renderItem receives the row type, not a string.
const wrongItem = <LegendList<Row> data={[]} renderItem={({ item }: { item: string }) => item} />;
// @ts-expect-error maintainScrollAtEnd takes options, not a number.
const wrongFollow = <LegendList<Row> data={[]} renderItem={() => null} maintainScrollAtEnd={1} />;

export type Checks = [
	Assert<Equal<typeof LegendList, LegendListComponent>>,
	Assert<Equal<ReturnType<LegendListComponent>, OctaneNode>>,
	Assert<Equal<LegendListProps<Row>['data'], ReadonlyArray<Row> | undefined>>,
	Assert<
		Equal<
			LegendListProps<Row>['maintainScrollAtEnd'],
			boolean | MaintainScrollAtEndOptions | undefined
		>
	>,
	Assert<Equal<ReturnType<LegendListRef['getState']>['isAtEnd'], boolean>>,
	Assert<Equal<LegendListRef['getScrollableNode'], () => HTMLElement>>,
	Assert<Equal<Parameters<LegendListRef['scrollToIndex']>[0]['index'], number>>,
	Assert<Equal<ScrollIndexWithOffsetPosition['viewPosition'], number | undefined>>,
	Assert<Equal<ReturnType<LegendListRef['scrollToEnd']>, Promise<void>>>,
	Assert<
		Equal<LegendListState['elementAtIndex'], (index: number) => HTMLElement | null | undefined>
	>,
	Assert<Equal<LegendListState['isAtEnd'], boolean>>,
	Assert<Equal<LegendListRenderItemProps<Row>['item'], Row>>,
	Assert<Equal<LegendListRenderItemProps<Row>['index'], number>>,
	Assert<Equal<AdaptiveRender, 'normal' | 'light'>>,
	Assert<Equal<AdaptiveRenderChangeReason, 'initial' | 'ready' | 'scroll'>>,
	Assert<Equal<AdaptiveRenderConfig['initialMode'], AdaptiveRender | undefined>>,
	Assert<
		Equal<
			AlwaysRenderConfig,
			{ top?: number; bottom?: number; indices?: number[]; keys?: string[] }
		>
	>,
	Assert<Equal<AnchoredEndSpaceConfig['anchorIndex'], number>>,
	Assert<Equal<ColumnWrapperStyle, { rowGap?: number; gap?: number; columnGap?: number }>>,
	Assert<Equal<Insets['top'], number>>,
	Assert<Equal<LayoutRectangle, { x: number; y: number; width: number; height: number }>>,
	Assert<Equal<LegendListAverageItemSize, { average: number; count: number }>>,
	Assert<Equal<LegendListMetrics, { headerSize: number; footerSize: number }>>,
	Assert<Equal<LegendListRecyclingState<Row>['item'], Row>>,
	Assert<Equal<MaintainScrollAtEndOnOptions['dataChange'], boolean | undefined>>,
	Assert<Equal<MaintainScrollAtEndOptions['on'], MaintainScrollAtEndOnOptions | undefined>>,
	Assert<Equal<MaintainVisibleContentPositionConfig<Row>['size'], boolean | undefined>>,
	Assert<Equal<NativeScrollEvent['contentOffset'], { x: number; y: number }>>,
	Assert<Equal<NativeSyntheticEvent<number>['nativeEvent'], number>>,
	Assert<
		Equal<OnViewableItemsChanged<Row>, ((info: OnViewableItemsChangedInfo<Row>) => void) | null>
	>,
	Assert<Equal<OnViewableItemsChangedInfo<Row>['changed'], Array<ViewToken<Row>>>>,
	Assert<Equal<ScrollIndexWithOffset['index'], number>>,
	Assert<Equal<ScrollIndexWithOffsetAndContentOffset['contentOffset'], number | undefined>>,
	Assert<Equal<StickyHeaderConfig['offset'], number | undefined>>,
	Assert<Equal<StyleProp<ViewStyle>, ViewStyle | ViewStyle[] | null | undefined | false>>,
	Assert<Equal<ViewStyle, Record<string, unknown>>>,
	Assert<Equal<ViewAmountToken<Row>['percentVisible'], number>>,
	Assert<Equal<ViewabilityAmountCallback<Row>, (viewToken: ViewAmountToken<Row>) => void>>,
	Assert<Equal<ViewabilityCallback<Row>, (viewToken: ViewToken<Row>) => void>>,
	Assert<Equal<ViewabilityConfig['itemVisiblePercentThreshold'], number | undefined>>,
	Assert<Equal<ViewabilityConfigCallbackPair<Row>['viewabilityConfig'], ViewabilityConfig>>,
	Assert<Equal<ViewabilityConfigCallbackPairs<Row>, ViewabilityConfigCallbackPair<Row>[]>>,
	Assert<Equal<ViewToken<Row>['item'], Row>>,
	// The per-row hooks.
	Assert<Equal<ReturnType<typeof useAdaptiveRender>, AdaptiveRender>>,
	Assert<Equal<Parameters<typeof useAdaptiveRenderChange>[0], (mode: AdaptiveRender) => void>>,
	Assert<Equal<ReturnType<typeof useIsLastItem>, boolean>>,
	Assert<Equal<ReturnType<typeof useListScrollSize>, { width: number; height: number }>>,
	Assert<Equal<ReturnType<typeof useSyncLayout>, () => void>>,
	Assert<Equal<ReturnType<typeof useRecyclingState<Row>>[0], Row>>,
	Assert<
		Equal<
			Parameters<typeof useRecyclingEffect>[0],
			(info: LegendListRecyclingState<unknown>) => void | (() => void)
		>
	>,
	Assert<Equal<Parameters<typeof useViewability<Row>>[0], ViewabilityCallback<Row>>>,
	Assert<Equal<Parameters<typeof useViewabilityAmount<Row>>[0], ViewabilityAmountCallback<Row>>>,
	// The integration bridge upstream's other entries consume.
	Assert<
		Equal<
			keyof typeof internal,
			| 'getComponent'
			| 'getStickyPushLimit'
			| 'IsNewArchitecture'
			| 'POSITION_OUT_OF_VIEW'
			| 'peek$'
			| 'typedForwardRef'
			| 'typedMemo'
			| 'useArr$'
			| 'useCombinedRef'
			| 'useLatestRef'
			| 'useStableRenderComponent'
			| 'useStateContext'
		>
	>,
];

// @ts-expect-error useIsLastItem is a boolean, not a string.
const lastLabel: string = useIsLastItem();
// @ts-expect-error useRecyclingState returns the row type.
const recycled: number = useRecyclingState<Row>(() => ({ id: 'b', label: 'B' }))[0];

export { list, wrongItem, wrongFollow, lastLabel, recycled };
