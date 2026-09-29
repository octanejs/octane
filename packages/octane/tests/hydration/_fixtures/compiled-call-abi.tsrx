import { useState } from 'octane';

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
