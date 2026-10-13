import { use, useLayoutEffect, useRef } from 'octane';

// One app that removes content through every structural slot kind: a branch
// arm, a keyed component, keyed rows, a value hole, and a branch arm inside a
// resolved Suspense primary. Each removed leaf reports, from its layout-effect
// cleanup, whether its host was still connected.

export type CleanupReport = (id: string, connected: boolean) => void;

export interface StructureProps {
	show: boolean;
	version: number;
	rows: string[];
	child: boolean;
	gate?: PromiseLike<unknown>;
	onCleanup: CleanupReport;
}

function Leaf(props: { id: string; onCleanup: CleanupReport }) @{
	const ref = useRef<HTMLElement | null>(null);
	useLayoutEffect(() => {
		const node = ref.current!;
		return () => props.onCleanup(props.id, node.isConnected);
	});
	<b id={props.id} ref={ref}>
		{props.id}
	</b>
}

function Gate(props: { gate: PromiseLike<unknown> }) @{
	use(props.gate);
	<u>{'gate'}</u>
}

export function StructureApp(props: StructureProps) @{
	<main>
		@if (props.show) {
			<Leaf id="arm" onCleanup={props.onCleanup} />
		} @else {
			<i>{'else'}</i>
		}
		<Leaf key={props.version} id={'keyed-' + props.version} onCleanup={props.onCleanup} />
		@for (const row of props.rows; key row) {
			<Leaf id={'row-' + row} onCleanup={props.onCleanup} />
		}
		{props.child ? <Leaf id="child" onCleanup={props.onCleanup} /> : 'no child'}
		@try {
			<>
				@if (props.show) {
					const id = useRef('held-arm').current;
					<Leaf id={id} onCleanup={props.onCleanup} />
				} @else {
					<i>{'held else'}</i>
				}
				<s>{'held sibling'}</s>
			</>
		} @pending {
			<p>{'pending'}</p>
		}
		@if (props.gate) {
			<Gate gate={props.gate} />
		}
	</main>
}

function Probe(props: { probe: () => void }) @{
	props.probe();
	<u>{'probe'}</u>
}

// A later sibling observes the DOM while the swap above it is still rendering.
function Shown() @{
	<em class="value">{'shown value'}</em>
}

function Hidden() @{
	<>
		<em class="value">{'hidden value'}</em>
		<small>{'second value root'}</small>
	</>
}

function Keyed(props: { label: string }) @{
	<q>{props.label}</q>
}

export function BranchProbeApp(props: { show: boolean; probe: () => void }) @{
	<main>
		@if (props.show) {
			<b id="shown">{'shown'}</b>
		} @else {
			<>
				<i id="hidden">{'hidden'}</i>
				<s>{'second root'}</s>
			</>
		}
		<Keyed key={props.show ? 'shown' : 'hidden'} label="keyed" />
		{props.show ? <Shown /> : <Hidden />}
		<Probe probe={props.probe} />
	</main>
}

function Row(props: { id: string; onCleanup: CleanupReport }) @{
	const ref = useRef<HTMLElement | null>(null);
	useLayoutEffect(() => {
		const node = ref.current!;
		return () => props.onCleanup(props.id, node.isConnected);
	});
	<li id={props.id} ref={ref}>
		{props.id}
	</li>
}

export interface ListProps {
	rows: string[];
	gate?: PromiseLike<unknown>;
	probe: () => void;
	onCleanup: CleanupReport;
}

// Two keyed lists: rows bounded by a pair (a component root), with an @empty
// arm, and self-marked host rows between static siblings. The probe renders
// after both lists reconcile.
export function ListProbeApp(props: ListProps) @{
	<main>
		<ul id="paired">
			@for (const row of props.rows; key row) {
				<Row id={'row-' + row} onCleanup={props.onCleanup} />
			} @empty {
				<li id="empty">{'empty'}</li>
			}
		</ul>
		<ol id="plain">
			<li>{'first'}</li>
			@for (const row of props.rows; key row) {
				<li class="plain">{row as string}</li>
			}
			<li>{'last'}</li>
		</ol>
		<Probe probe={props.probe} />
		@if (props.gate) {
			<Gate gate={props.gate} />
		}
	</main>
}
