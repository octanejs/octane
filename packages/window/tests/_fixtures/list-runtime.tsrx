import { List, useListCallbackRef, useListRef } from '../../src';

export const listRuntimeEvents: {
	ranges: Array<{
		visible: { startIndex: number; stopIndex: number };
		overscan: { startIndex: number; stopIndex: number };
	}>;
	ref: ReturnType<typeof useListRef> | null;
} = { ranges: [], ref: null };

export const listHookInitializerEvents: {
	callbackDirect: unknown;
	callbackLazy: unknown;
	ref: unknown;
} = { callbackDirect: null, callbackLazy: null, ref: null };

export function resetListRuntimeEvents() {
	listRuntimeEvents.ranges.length = 0;
	listRuntimeEvents.ref = null;
	listHookInitializerEvents.callbackDirect = null;
	listHookInitializerEvents.callbackLazy = null;
	listHookInitializerEvents.ref = null;
}

export function ListHookInitializerFixture() @{
	const initialApi = { kind: 'list-initial-api' } as any;
	const initialLazyApi = { kind: 'list-lazy-api' } as any;
	const ref = useListRef(initialApi);
	const [callbackDirect] = useListCallbackRef(initialApi);
	const [callbackLazy] = useListCallbackRef(() => initialLazyApi);
	listHookInitializerEvents.ref = ref.current;
	listHookInitializerEvents.callbackDirect = callbackDirect;
	listHookInitializerEvents.callbackLazy = callbackLazy;
	<div data-testid="list-hook-initializers" />
}

function Row({ ariaAttributes, index, label, style }: any) @{
	<div {...ariaAttributes} data-index={index} style={style}>{`${label} ${index}`}</div>
}

export function ListRuntimeFixture() @{
	const listRef = useListRef(null);
	listRuntimeEvents.ref = listRef;

	<List
		data-testid="list"
		listRef={listRef}
		onRowsRendered={(visible, overscan) => {
			listRuntimeEvents.ranges.push({ visible, overscan });
		}}
		overscanCount={1}
		rowComponent={Row}
		rowCount={100}
		rowHeight={20}
		rowKey={(index) => index}
		rowProps={{ label: 'Row' }}
		style={{ height: 100, width: 200 }}
	/>
}
