import { createElement, createPortal, use } from 'octane';

// A compiled single-root component: returning `<Solo/>` from a plain function
// takes renderBlock's markerless componentSlotSlot return path — the OTHER
// return-slot kind, so flipping host ⇄ Solo exercises disposeReturnSlot on an
// ANCHORLESS childSlot.
function Solo(props: { label: string }) @{
	<p class="solo">{props.label as string}</p>
}

// Return-slot flipper. `mode === 'host'` returns a LONE PURE-HOST descriptor —
// the anchorless childSlot regime — and every other mode flips the slot into a
// different content kind (text / null / de-opt array / singleRoot component /
// host-with-component-children / portal), which must promote the slot to
// markers in place without losing its position between the <b> siblings.
function Flipper(props: { mode: string; target?: HTMLElement; hostRef?: any; tag?: string }) {
	const mode = props.mode;
	if (mode === 'host') {
		return createElement('div', { id: 'host', ref: props.hostRef }, 'host');
	}
	if (mode === 'text') {
		return 'plain';
	}
	if (mode === 'null') {
		return null;
	}
	if (mode === 'array') {
		return [createElement('i', { key: 'a' }, 'a'), createElement('i', { key: 'b' }, 'b')];
	}
	if (mode === 'comp') {
		return <Solo label="solo" />;
	}
	if (mode === 'editor') {
		return createElement(props.tag!, { 'data-label': 'ready' }, 'editor');
	}
	if (mode === 'hostcomp') {
		return createElement('div', { id: 'hc' }, createElement(Solo, { label: 'deep' }));
	}
	if (mode === 'portal') {
		return createPortal(Solo, props.target!, { label: 'portal' });
	}
	return null;
}

export function App(props: { mode: string; target?: HTMLElement; hostRef?: any; tag?: string }) @{
	<section class="root">
		<b>{'A'}</b>
		<Flipper mode={props.mode} target={props.target} hostRef={props.hostRef} tag={props.tag} />
		<b>{'B'}</b>
	</section>
}

export function EditorRows(props: { tag: string; labels: readonly string[] }) @{
	<ul>
		@for (const label of props.labels; key label) {
			<li>{createElement(props.tag, { 'data-label': label })}</li>
		}
	</ul>
}

interface RetryRowsProps {
	rows: readonly { id: string; tag: string; label: string }[];
	gate?: PromiseLike<string>;
}

function RetryRowsTail(props: { gate?: PromiseLike<string> }) @{
	const label = props.gate ? use(props.gate) : 'ready';
	<output>{label as string}</output>
}

export function SingleEditorRetryRows(props: RetryRowsProps) @{
	<main>
		<ul>
			@for (const row of props.rows; key row.id) {
				<li data-id={row.id}>{createElement(row.tag, { 'data-label': row.label })}</li>
			}
		</ul>
		<RetryRowsTail gate={props.gate} />
	</main>
}

export function MultipleEditorRetryRows(props: RetryRowsProps) @{
	<main>
		<ul>
			@for (const row of props.rows; key row.id) {
				<>
					<li data-id={row.id}>{createElement(row.tag, { 'data-label': row.label })}</li>
					<li>row end</li>
				</>
			}
		</ul>
		<RetryRowsTail gate={props.gate} />
	</main>
}

function NewEditor(props: { tag: string }) {
	return createElement(
		props.tag,
		{ 'data-label': 'ready', defaultValue: 'server draft' },
		createElement('input', { defaultValue: 'native draft' }),
	);
}

export function ConditionalEditor(props: { tag: string; show: boolean }) @{
	<section>
		<b>A</b>
		@if (props.show) {
			<NewEditor tag={props.tag} />
		} @else {
			<span>waiting</span>
		}
		<b>B</b>
	</section>
}
