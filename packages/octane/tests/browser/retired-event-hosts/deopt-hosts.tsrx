import { createElement, useLayoutEffect, useState } from 'octane';

type Observe = { readonly observe: (entry: string) => void };
type Toggle = Observe & { readonly show: boolean };

// A host in a value hole has no Block of its own: the live component's Block
// renders it, so removing it disposes nothing.
export function HoleHost({ observe, show }: Toggle) @{
	<section onBlur={() => observe('parent')}>
		{show && (
			<div onBlur={() => observe('dropped')}>
				<input />
			</div>
		)}
	</section>
}

export function HoleInput({ observe, show }: Toggle) @{
	<section onBlur={() => observe('parent')}>
		{show && <input onBlur={() => observe('dropped')} />}
	</section>
}

// The removed span is a de-opt child of a de-opt element that stays.
export function NestedHole({ observe, show }: Toggle) @{
	<section onBlur={() => observe('parent')}>
		{createElement(
			'div',
			{ onBlur: () => observe('wrapper') },
			show && createElement('span', { onBlur: () => observe('dropped') }, createElement('input')),
		)}
	</section>
}

function pick(observe: (entry: string) => void, show: boolean) {
	return show ? (
		<div onBlur={() => observe('dropped')}>
			<input />
		</div>
	) : (
		<p>{'gone'}</p>
	);
}

// A different tag replaces the hole's host node.
export function SwappedHole({ observe, show }: Toggle) @{
	<section onBlur={() => observe('parent')}>{pick(observe, show)}</section>
}

function Label() @{
	<span>{'label'}</span>
}

function pickWithChild(observe: (entry: string) => void, show: boolean) {
	return show ? (
		<div onBlur={() => observe('dropped')}>
			<Label />
			<input />
		</div>
	) : (
		<p>
			<Label />
		</p>
	);
}

// Component children give the host a Block that survives its tag change.
export function SwappedBlockHost({ observe, show }: Toggle) @{
	<section onBlur={() => observe('parent')}>{pickWithChild(observe, show)}</section>
}

// The same host in a value hole gets its own Block, which the removal disposes.
export function BlockHostHole({ observe, show }: Toggle) @{
	<section onBlur={() => observe('parent')}>
		{show && (
			<div onBlur={() => observe('dropped')}>
				<Label />
				<input />
			</div>
		)}
	</section>
}

function list(observe: (entry: string) => void, rows: readonly number[]) {
	return rows.map((row) => (
		<div key={row} onBlur={() => observe('dropped')}>
			<input data-row={row} />
		</div>
	));
}

export function MappedRows({ observe, rows }: Observe & { readonly rows: readonly number[] }) @{
	<section onBlur={() => observe('parent')}>{list(observe, rows)}</section>
}

export function HoleCaptured({ observe, show, remove }: Toggle & { readonly remove: () => void }) @{
	<section onClick={() => observe('section')}>
		{show && (
			<div onClick={() => observe('div')}>
				<button onClick={remove}>{'remove'}</button>
			</div>
		)}
	</section>
}

// The capture phase removes the div before the bubble phase snapshots it.
export function HoleCapturePhase({
	observe,
	show,
	remove,
}: Toggle & {
	readonly remove: () => void;
}) @{
	<section onClickCapture={remove} onClick={() => observe('section')}>
		{show && (
			<div onClick={() => observe('div')}>
				<button>{'remove'}</button>
			</div>
		)}
	</section>
}

// The owning component's state update removes the host.
export function StatefulHole({
	observe,
	expose,
	Fixture,
}: Observe & {
	readonly expose: (hide: () => void) => void;
	readonly Fixture: (props: Toggle) => void;
}) @{
	const [show, setShow] = useState(true);
	useLayoutEffect(() => expose(() => setShow(false)), []);
	<Fixture observe={observe} show={show} />
}
