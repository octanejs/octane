import { useState } from 'octane';
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

function NamedRow({ ariaAttributes, index, left, right, style }: any) @{
	<div {...ariaAttributes} data-index={index} style={style}>
		{left === undefined ? 'right' : 'left'}
		{' ' + (left ?? right)}
	</div>
}

export function ListChangedPropKeyFixture() @{
	const [useRight, setUseRight] = useState(false);
	<div>
		<button onClick={() => setUseRight(true)}>Use right key</button>
		<List
			defaultHeight={20}
			rowComponent={NamedRow}
			rowCount={1}
			rowHeight={20}
			rowProps={useRight ? { right: 1 } : { left: 1 }}
			style={{ height: 20, width: 100 }}
		/>
	</div>
}

function ShapeRow({ ariaAttributes, index, style, x, y }: any) @{
	<div {...ariaAttributes} data-index={index} style={style}>
		{'x=' + x + (y === undefined ? '' : ' y=' + y)}
	</div>
}

export function ListPropShapeFixture(props: { initialExpanded: boolean }) @{
	const [expanded, setExpanded] = useState(props.initialExpanded);
	<div>
		<button onClick={() => setExpanded(!expanded)}>Toggle shape</button>
		<List
			defaultHeight={20}
			rowComponent={ShapeRow}
			rowCount={1}
			rowHeight={20}
			rowProps={expanded ? { x: 'y', y: 1 } : { x: 'y' }}
			style={{ height: 20, width: 100 }}
		/>
	</div>
}

function DelimitedKeysRow({ ariaAttributes, index, style, ...props }: any) @{
	const keys = ['a,b', 'a', 'b'].filter((key) => Object.hasOwn(props, key));
	<div {...ariaAttributes} data-index={index} style={style}>{keys.join('|')}</div>
}

export function ListDelimitedKeysFixture() @{
	const [split, setSplit] = useState(false);
	<div>
		<button onClick={() => setSplit(true)}>Split keys</button>
		<List
			defaultHeight={20}
			rowComponent={DelimitedKeysRow}
			rowCount={1}
			rowHeight={20}
			rowProps={split ? { a: 1, b: 1 } : { 'a,b': 1 }}
			style={{ height: 20, width: 100 }}
		/>
	</div>
}
