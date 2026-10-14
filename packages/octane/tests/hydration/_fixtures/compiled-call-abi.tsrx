import { Suspense, use, useState } from 'octane';

function Counter(props: { label: string }) @{
	const [count, setCount] = useState(0);
	<button class={props.label} onClick={() => setCount(count + 1)}>
		{props.label + ':' + count}
	</button>
}

// A changed key remounts the call; an unchanged key keeps its state.
export function KeyedCall(props: { version: number }) @{
	<section>
		<Counter key={props.version} label="keyed" />
		<span>{'after'}</span>
	</section>
}

// An explicit `key={undefined}` keeps one stable instance across renders.
export function OptionalKeyCall(props: { id?: string }) @{
	<section>
		<Counter key={props.id} label="optional" />
	</section>
}

// The sole output of a body borrows the enclosing block's range.
export function SoleRootCall(props: { label: string }) @{
	<Counter label={props.label} />
}

// Anchored before a sibling, then appended to its host.
export function SiblingCalls(props: { first: string; second: string }) @{
	<section>
		<Counter label={props.first} />
		<hr />
		<Counter label={props.second} />
	</section>
}

// Signal-capable text holes: only-child (seeded placeholder) and sibling.
export function OnlyChildText(props: { value: any }) @{
	<p>{props.value as string}</p>
}

export function SiblingText(props: { value: any }) @{
	<p>
		<b>{'before'}</b>
		{props.value as string}
		<i>{'after'}</i>
	</p>
}

interface ReturnRowProps {
	id: string;
	visible: boolean;
	onInputRef: (id: string, node: HTMLInputElement | null) => void;
}

function ReturnRowEditor(props: ReturnRowProps) @{
	const [count, setCount] = useState(0);
	<>
		<input
			data-row={props.id}
			defaultValue={props.id}
			ref={(node) => props.onInputRef(props.id, node)}
		/>
		<button data-row={props.id} onClick={() => setCount(count + 1)}>
			{props.id + ':' + count}
		</button>
	</>
}

function ReturnRowChoice(props: ReturnRowProps) {
	if (props.visible)
		return <ReturnRowEditor id={props.id} visible={props.visible} onInputRef={props.onInputRef} />;
	return <em data-row={props.id}>{props.id + ' hidden'}</em>;
}

function ReturnRowMiddle(props: ReturnRowProps) {
	return <ReturnRowChoice id={props.id} visible={props.visible} onInputRef={props.onInputRef} />;
}

function ReturnRow(props: ReturnRowProps) {
	return <ReturnRowMiddle id={props.id} visible={props.visible} onInputRef={props.onInputRef} />;
}

export function ReturnedRows(props: {
	ids: string[];
	hidden: string;
	onInputRef: ReturnRowProps['onInputRef'];
}) @{
	<section>
		<i>before</i>
		@for (const id of props.ids; key id) {
			<ReturnRow id={id} visible={id !== props.hidden} onInputRef={props.onInputRef} />
		}
		<strong>after</strong>
	</section>
}

export function PlainReturnedEditor(props: ReturnRowProps) {
	return <ReturnRow id={props.id} visible={props.visible} onInputRef={props.onInputRef} />;
}

export function SeededReturnedEditor(props: ReturnRowProps & { data: Promise<string> }) {
	const id = use(props.data);
	return <PlainReturnedEditor id={id} visible={props.visible} onInputRef={props.onInputRef} />;
}

function ReturnReplacement() @{
	<p>replacement</p>
}

function ReturnDynamicBoundary(props: { boundary: boolean }) {
	const Components = { Active: props.boundary ? Suspense : ReturnReplacement };
	return (
		<Components.Active fallback={<p>waiting</p>}>
			<b>first</b>
			<small>second</small>
		</Components.Active>
	);
}

export function ReturnedDynamicBoundary(props: { boundary: boolean }) @{
	<section>
		<i>before</i>
		<ReturnDynamicBoundary boundary={props.boundary} />
		<strong>after</strong>
	</section>
}
