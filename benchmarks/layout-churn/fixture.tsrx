// Every variant ends with each row's bar as wide as its label. They differ only
// in when the label is measured and when the bar is written. This module is
// compiled without Strong mode: the first three rows are the patterns to avoid.
import { useLayoutEffect, useLayoutSnapshot, useRef, useState } from 'octane';

interface RowProps {
	id: number;
	revision: number;
}

const text = (props: RowProps) => 'row ' + props.id + ' ' + 'x'.repeat((props.id + props.revision) % 7);

// Avoid: each layout effect reads, then writes. The next row's read lays out again.
function EffectInterleaved(props: RowProps) @{
	const label = useRef<HTMLSpanElement | null>(null);
	const bar = useRef<HTMLElement | null>(null);
	useLayoutEffect(() => {
		bar.current!.style.width = label.current!.offsetWidth + 'px';
	}, null);
	<div class="row">
		<span ref={label}>{text(props)}</span>
		<i ref={bar} />
	</div>
}

// Avoid: the batched read pass is broken by a write in every measurement.
// Strong mode rejects this as OCTANE_STRONG_LAYOUT_SNAPSHOT_WRITE.
function SnapshotWrite(props: RowProps) @{
	const label = useRef<HTMLSpanElement | null>(null);
	const bar = useRef<HTMLElement | null>(null);
	useLayoutSnapshot(
		() => {
			const width = label.current?.offsetWidth ?? 0;
			if (bar.current) bar.current.style.width = width + 'px';
			return width;
		},
		{ initial: 0 },
	);
	<div class="row">
		<span ref={label}>{text(props)}</span>
		<i ref={bar} />
	</div>
}

// Avoid: reads stay together, but every row renders twice before paint.
// Strong mode rejects this as OCTANE_STRONG_EFFECT_STATE_UPDATE.
function EffectState(props: RowProps) @{
	const label = useRef<HTMLSpanElement | null>(null);
	const [width, setWidth] = useState(0);
	useLayoutEffect(() => {
		setWidth(label.current!.offsetWidth);
	}, null);
	<div class="row">
		<span ref={label}>{text(props)}</span>
		<i style={{ width: width + 'px' }} />
	</div>
}

function Snapshot(props: RowProps) @{
	const label = useRef<HTMLSpanElement | null>(null);
	const width = useLayoutSnapshot(() => label.current?.offsetWidth ?? 0, { initial: 0 });
	<div class="row">
		<span ref={label}>{text(props)}</span>
		<i style={{ width: width + 'px' }} />
	</div>
}

// The handler variants measure from a click, so their rows measure nothing.
function Plain(props: RowProps) @{
	<div class="row">
		<span>{text(props)}</span>
		<i />
	</div>
}

const ROWS = {
	'effect-interleaved': EffectInterleaved,
	'snapshot-write': SnapshotWrite,
	'effect-state': EffectState,
	snapshot: Snapshot,
	'handler-interleaved': Plain,
	'handler-batched': Plain,
};

export type Variant = keyof typeof ROWS;

export function App(props: { variant: Variant; ids: number[]; revision: number }) @{
	const list = useRef<HTMLElement | null>(null);
	const Row = ROWS[props.variant];
	// Avoid: a write between reads, once per row.
	const interleaved = () => {
		for (const row of list.current!.children) {
			const width = (row.firstElementChild as HTMLElement).offsetWidth;
			(row.lastElementChild as HTMLElement).style.width = width + 'px';
		}
	};
	const batched = () => {
		const rows = [...list.current!.children];
		const widths = rows.map((row) => (row.firstElementChild as HTMLElement).offsetWidth);
		rows.forEach((row, index) => {
			(row.lastElementChild as HTMLElement).style.width = widths[index] + 'px';
		});
	};
	<main>
		<button onClick={props.variant === 'handler-interleaved' ? interleaved : batched}>
			{'Measure'}
		</button>
		<section ref={list}>
			@for (const id of props.ids; key id) {
				<Row id={id} revision={props.revision} />
			}
		</section>
	</main>
}
