/** @jsxImportSource @octanejs/lynx/intrinsics */
// Black-box cross-framework benchmark UI — Octane variant.
//
// Mirrors apps/ui-vdom/src/App.vue and apps/ui-react/src/App.tsx
// operation-for-operation, written idiomatically for Octane: immutable state
// updates + a keyed `@for` over a `Row` component. The rendered class
// structure (.page/.toolbar/.btn>.btn-text/.rows/.row(.danger)>.col-*) is the
// harness contract and must match the other apps exactly.
import { useCallback, useRef, useState } from 'octane';

import { buildData, buildDataSeeded } from './data.js';
import type { RowData } from './data.js';

// Mount-create ladder: BENCH_AUTOROWS=N builds a variant whose table is
// already populated at mount, so create cost is measurable without taps.
declare const __BENCH_AUTOROWS__: number;
const INITIAL_ROWS: RowData[] =
	__BENCH_AUTOROWS__ > 0 ? buildDataSeeded(__BENCH_AUTOROWS__) : [];

// -- storms: N sequential state→render→DOM ticks from one click --------------
// Each tick runs in its own macrotask (MessageChannel avoids the nested
// setTimeout 4ms clamp) so every mutation goes through a full render cycle
// instead of batching. Mirrors the Vue and React apps.
const STORM_UPDATE_TICKS = 50;
const STORM_SELECT_TICKS = 30;

const _stormChannel = new MessageChannel();
let _stormPending: (() => void) | null = null;
_stormChannel.port1.onmessage = () => {
	const cb = _stormPending;
	_stormPending = null;
	if (cb) cb();
};
function nextMacrotask(cb: () => void) {
	_stormPending = cb;
	_stormChannel.port2.postMessage(0);
}

function runStorm(ticks: number, step: (t: number) => void) {
	let t = 0;
	const tick = () => {
		t += 1;
		step(t);
		if (t < ticks) nextMacrotask(tick);
	};
	nextMacrotask(tick);
}

interface RowProps {
	row: RowData;
	isSelected: boolean;
	onSelect: (id: number) => void;
	onRemove: (id: number) => void;
}

function Row(props: RowProps) @{
	<view class={['row', props.isSelected && 'danger']}>
		<text class="col-id">{String(props.row.id)}</text>
		<text class="col-label" bindtap={() => props.onSelect(props.row.id)}>{props.row.label}</text>
		<text class="col-remove" bindtap={() => props.onRemove(props.row.id)}>{'x'}</text>
	</view>
}

export function App() @{
	const [rows, setRows] = useState<RowData[]>(INITIAL_ROWS);
	const [selected, setSelected] = useState<number | undefined>(undefined);

	const run = useCallback(() => {
		setRows(buildData());
		setSelected(undefined);
	}, []);
	const run3k = useCallback(() => {
		setRows(buildData(3000));
		setSelected(undefined);
	}, []);
	const run5k = useCallback(() => {
		setRows(buildData(5000));
		setSelected(undefined);
	}, []);
	const runLots = useCallback(() => {
		setRows(buildData(10000));
		setSelected(undefined);
	}, []);
	const run20k = useCallback(() => {
		setRows(buildData(20000));
		setSelected(undefined);
	}, []);
	const run30k = useCallback(() => {
		setRows(buildData(30000));
		setSelected(undefined);
	}, []);
	const add = useCallback(() => {
		setRows((prev) => prev.concat(buildData(1000)));
	}, []);
	const update = useCallback(() => {
		setRows((prev) => {
			const next = prev.slice();
			for (let i = 0; i < next.length; i += 10) {
				next[i] = { id: next[i]!.id, label: `${next[i]!.label} !!!` };
			}
			return next;
		});
	}, []);
	const select = useCallback((id: number) => {
		setSelected(id);
	}, []);
	const remove = useCallback((id: number) => {
		setRows((prev) => {
			const idx = prev.findIndex((d) => d.id === id);
			return prev.slice(0, idx).concat(prev.slice(idx + 1));
		});
	}, []);
	const swapRows = useCallback(() => {
		setRows((prev) => {
			if (prev.length <= 998) return prev;
			const next = prev.slice();
			const d1 = next[1]!;
			next[1] = next[998]!;
			next[998] = d1;
			return next;
		});
	}, []);
	const clear = useCallback(() => {
		setRows([]);
		setSelected(undefined);
	}, []);

	// Storm drivers read ids off a ref so the module-scope tick loop never
	// captures a stale rows binding (same shape as the React app).
	const idsRef = useRef<number[]>([]);
	idsRef.current = rows.map((r) => r.id);

	const stormUpdate = useCallback(() => {
		runStorm(
			STORM_UPDATE_TICKS,
			(t) => setRows(
				(prev) => prev.map((r, i) => (i % 10 === 0 ? { id: r.id, label: 'bench ' + t } : r)),
			),
		);
	}, []);

	const stormSelect = useCallback(() => {
		runStorm(STORM_SELECT_TICKS, (t) => {
			const ids = idsRef.current;
			setSelected(t < STORM_SELECT_TICKS ? ids[(t * 97) % ids.length]! : ids[0]!);
		});
	}, []);

	<view class="page">
		<text class="title">{'Octane UI Benchmark on Lynx · ready'}</text>
		<view class="toolbar">
			<view class="btn" bindtap={run}>
				<text class="btn-text">{'Create 1,000 rows'}</text>
			</view>
			<view class="btn" bindtap={run3k}>
				<text class="btn-text">{'Create 3,000 rows'}</text>
			</view>
			<view class="btn" bindtap={run5k}>
				<text class="btn-text">{'Create 5,000 rows'}</text>
			</view>
			<view class="btn" bindtap={runLots}>
				<text class="btn-text">{'Create 10,000 rows'}</text>
			</view>
			<view class="btn" bindtap={run20k}>
				<text class="btn-text">{'Create 20,000 rows'}</text>
			</view>
			<view class="btn" bindtap={run30k}>
				<text class="btn-text">{'Create 30,000 rows'}</text>
			</view>
			<view class="btn" bindtap={add}>
				<text class="btn-text">{'Append 1,000 rows'}</text>
			</view>
			<view class="btn" bindtap={update}>
				<text class="btn-text">{'Update every 10th row'}</text>
			</view>
			<view class="btn" bindtap={swapRows}>
				<text class="btn-text">{'Swap Rows'}</text>
			</view>
			<view class="btn" bindtap={clear}>
				<text class="btn-text">{'Clear'}</text>
			</view>
			<view class="btn" bindtap={stormUpdate}>
				<text class="btn-text">{'Update storm'}</text>
			</view>
			<view class="btn" bindtap={stormSelect}>
				<text class="btn-text">{'Select storm'}</text>
			</view>
		</view>
		<view class="rows">
			@for (const row of rows; key row.id) {
				<Row row={row} isSelected={selected === row.id} onSelect={select} onRemove={remove} />
			}
		</view>
	</view>
}
