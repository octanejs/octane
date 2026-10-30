import { useState } from 'octane';
import {
	LegendList,
	type LegendListRenderItemProps,
	type MaintainScrollAtEndOptions,
	useIsLastItem,
	useListScrollSize,
	useRecyclingEffect,
	useRecyclingState,
	useViewability,
} from 'legend-list-under-test';

import { harness, makeRows, record, type Row } from './bridge.ts';

// Every scenario renders a LegendList against the shared harness ref and exposes its
// state setters as named actions, so the driver applies the same steps to the Octane
// page and the React page. Row heights come from the data, so a step can resize a row
// by replacing it.

function RowView({ row }: { row: Row }) @{
	<div data-row={row.id} style={{ height: row.height + 'px' }}>
		{row.label}
	</div>
}

const keyExtractor = (row: Row) => row.id;
const getItemType = (row: Row) => row.type;
const renderRow = ({ item }: LegendListRenderItemProps<Row>) => <RowView row={item} />;

function resize(rows: Row[], id: string, height: number) {
	return rows.map((row) => (row.id === id ? { ...row, height } : row));
}

function useRows(initial: () => Row[]) {
	const [data, setData] = useState(initial);
	harness.actions.append = (count: number, prefix = 'r') =>
		setData((rows) => [...rows, ...makeRows(count, rows.length, prefix)]);
	harness.actions.prepend = (count: number) =>
		setData((rows) => [...makeRows(count, 0, 'p' + rows.length + '-'), ...rows]);
	harness.actions.resize = (id: string, height: number) =>
		setData((rows) => resize(rows, id, height));
	harness.actions.remove = (from: number, count: number) =>
		setData((rows) => rows.filter((_, index) => index < from || index >= from + count));
	harness.actions.replace = (count: number, prefix: string) => setData(makeRows(count, 0, prefix));
	return data;
}

export function Basic() @{
	const data = useRows(() => makeRows(100));
	<LegendList
		ref={harness.ref}
		data={data}
		keyExtractor={keyExtractor}
		renderItem={renderRow}
		estimatedItemSize={50}
		recycleItems
		style={{ height: '400px' }}
		onEndReached={(info) => record('endReached', info.distanceFromEnd)}
		onStartReached={(info) => record('startReached', info.distanceFromStart)}
	/>
}

// MessagesTimeline in T3 Code: opens at the end, follows appended messages, keeps
// the visible message steady when history loads above or a message above resizes.
const FOLLOW_END: MaintainScrollAtEndOptions = {
	animated: false,
	on: { dataChange: true, footerLayout: false, itemLayout: true, layout: true },
};

function ChatHeader() @{
	<div data-header="" style={{ height: '30px' }}>
		{'History'}
	</div>
}

export function Chat() @{
	const data = useRows(() => makeRows(40, 0, 'm'));
	const [follow, setFollow] = useState(true);
	const [footerHeight, setFooterHeight] = useState(24);
	const [version, setVersion] = useState(0);
	harness.actions.follow = setFollow;
	harness.actions.footer = setFooterHeight;
	harness.actions.bump = () => setVersion((value) => value + 1);
	<LegendList
		ref={harness.ref}
		data={data}
		extraData={version}
		dataVersion={String(version)}
		keyExtractor={keyExtractor}
		getItemType={getItemType}
		renderItem={renderRow}
		estimatedItemSize={90}
		initialScrollAtEnd
		maintainScrollAtEnd={follow ? FOLLOW_END : false}
		maintainScrollAtEndThreshold={1}
		maintainVisibleContentPosition={{ data: true, size: true }}
		onLoad={() => record('load')}
		onItemSizeChanged={(info) => record('itemSize', info.itemKey, info.size)}
		ListHeaderComponent={ChatHeader}
		ListFooterComponent={<div data-footer="" style={{ height: footerHeight + 'px' }} />}
		className="timeline"
		style={{ height: '500px' }}
	/>
}

// The pickers (models, branches, fonts, commands): recycled rows, separators, a
// highlighted value carried in extraData, and filtering that shrinks the data.
function Separator() @{
	<div data-separator="" style={{ height: '1px' }} />
}

export function Picker() @{
	const data = useRows(() => makeRows(60, 0, 'o'));
	const [highlighted, setHighlighted] = useState('o0');
	harness.actions.highlight = setHighlighted;
	<LegendList
		ref={harness.ref}
		data={data}
		extraData={highlighted}
		keyExtractor={keyExtractor}
		renderItem={({ item, extraData }) => (
			<div
				data-row={item.id}
				data-active={String(extraData === item.id)}
				style={{ height: '30px' }}
			>
				{item.label}
			</div>
		)}
		estimatedItemSize={30}
		drawDistance={480}
		recycleItems
		ItemSeparatorComponent={Separator}
		contentContainerClassName="pl-2"
		onLayout={(event) => record('layout', Math.round(event.nativeEvent.layout.height))}
		style={{ height: Math.min(data.length * 30, 288) + 'px' }}
	/>
}

// TimelineWorkGroupRows: restores a saved row with an intra-row offset, keeping that
// row rendered while the list bootstraps.
export function Restore() @{
	const data = useRows(() => makeRows(80, 0, 'w'));
	<LegendList
		ref={harness.ref}
		data={data}
		keyExtractor={keyExtractor}
		renderItem={renderRow}
		estimatedItemSize={56}
		drawDistance={240}
		recycleItems
		initialScrollIndex={{ index: 30, viewOffset: 12 }}
		alwaysRender={{ indices: [30] }}
		maintainVisibleContentPosition
		maintainScrollAtEnd={false}
		onLoad={() => record('load')}
		style={{ height: '360px' }}
	/>
}

// The send flow in MessagesTimeline: reserve end space so the newest message can
// scroll to the top, and keep it out of the inset the composer covers.
export function Anchored() @{
	const data = useRows(() => makeRows(12, 0, 'a'));
	const [anchorIndex, setAnchorIndex] = useState<number | null>(null);
	harness.actions.anchor = setAnchorIndex;
	<LegendList
		ref={harness.ref}
		data={data}
		keyExtractor={keyExtractor}
		renderItem={renderRow}
		estimatedItemSize={60}
		initialScrollAtEnd
		{...(anchorIndex === null
			? {}
			: {
					anchoredEndSpace: {
						anchorIndex,
						anchorOffset: 8,
						onSizeChanged: (size: number) => record('anchoredSize', Math.round(size)),
					},
				})}
		contentInsetEndAdjustment={anchorIndex === null ? 0 : 40}
		style={{ height: '420px' }}
	/>
}

export function Empty() @{
	const data = useRows(() => []);
	<LegendList
		ref={harness.ref}
		data={data}
		keyExtractor={keyExtractor}
		renderItem={renderRow}
		estimatedItemSize={50}
		ListEmptyComponent={<div data-empty="">{'Nothing yet'}</div>}
		style={{ height: '300px' }}
	/>
}

function Tile({ row }: { row: Row }) @{
	<div data-row={row.id} style={{ height: '80px', width: row.height + 40 + 'px' }}>
		{row.label}
	</div>
}

export function Horizontal() @{
	const data = useRows(() => makeRows(60, 0, 'h'));
	<LegendList
		ref={harness.ref}
		data={data}
		horizontal
		keyExtractor={keyExtractor}
		renderItem={({ item }) => <Tile row={item} />}
		estimatedItemSize={100}
		style={{ height: '100px', width: '320px' }}
	/>
}

export function Columns() @{
	const data = useRows(() => makeRows(90, 0, 'c'));
	<LegendList
		ref={harness.ref}
		data={data}
		numColumns={3}
		columnWrapperStyle={{ gap: 6 }}
		keyExtractor={keyExtractor}
		renderItem={renderRow}
		estimatedItemSize={60}
		style={{ height: '400px' }}
	/>
}

export function Sticky() @{
	const data = useRows(() => makeRows(80, 0, 's'));
	<LegendList
		ref={harness.ref}
		data={data}
		stickyHeaderIndices={[0, 20, 40]}
		onStickyHeaderChange={(info) => record('sticky', info.index)}
		keyExtractor={keyExtractor}
		renderItem={renderRow}
		estimatedItemSize={60}
		style={{ height: '400px' }}
	/>
}

export function Children() @{
	<LegendList ref={harness.ref} estimatedItemSize={40} style={{ height: '200px' }}>
		<div data-row="k0" style={{ height: '40px' }}>
			{'First child'}
		</div>
		<div data-row="k1" style={{ height: '70px' }}>
			{'Second child'}
		</div>
		<div data-row="k2" style={{ height: '40px' }}>
			{'Third child'}
		</div>
	</LegendList>
}

// The per-row hooks exported next to LegendList, observed from recycled rows.
function HookRow({ row }: { row: Row }) @{
	const isLast = useIsLastItem();
	const scrollSize = useListScrollSize();
	const [visits, setVisits] = useRecyclingState(() => 0);
	useRecyclingEffect(({ index, prevIndex }) => {
		record('recycled', row.id, index, prevIndex);
	});
	useViewability((token) => {
		if (token.isViewable) record('viewable', token.key);
	});
	<div
		data-row={row.id}
		data-last={String(isLast)}
		data-width={String(scrollSize?.width ?? 0)}
		style={{ height: row.height + 'px' }}
		onClick={() => setVisits((value) => value + 1)}
	>
		{row.label + ' visits ' + visits}
	</div>
}

export function Hooks() @{
	const data = useRows(() => makeRows(50, 0, 'u'));
	<LegendList
		ref={harness.ref}
		data={data}
		keyExtractor={keyExtractor}
		renderItem={({ item }) => <HookRow row={item} />}
		estimatedItemSize={50}
		recycleItems
		viewabilityConfig={{ itemVisiblePercentThreshold: 50 }}
		onViewableItemsChanged={({ changed }) =>
			record(
				'viewableChanged',
				changed.map((token) => token.key + ':' + token.isViewable),
			)
		}
		style={{ height: '300px' }}
	/>
}

export function Snap() @{
	const data = useRows(() => makeRows(60, 0, 'n'));
	<LegendList
		ref={harness.ref}
		data={data}
		snapToIndices={[0, 10, 20, 30]}
		keyExtractor={keyExtractor}
		renderItem={renderRow}
		estimatedItemSize={60}
		style={{ height: '300px' }}
	/>
}
