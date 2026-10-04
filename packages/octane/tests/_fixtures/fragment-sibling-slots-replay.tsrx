import { useState } from 'octane';

// Sibling slots at the root of a fragment body whose first render updates its
// own state while it evaluates a slot's arguments, so that render replays
// before the slots settle. Strong mode rejects a render-phase update, so these
// compile without it.

function OnlyA(props: { a: boolean }) @{
	@if (props.a) {
		<span>{'a'}</span>
	}
}

/** Pass a value through, scheduling the caller's own update the first time. */
function useSettle(): (value: boolean) => boolean {
	const [settled, setSettled] = useState(false);
	return (value) => {
		if (!settled) setSettled(true);
		return value;
	};
}

function IfPair(props: { a: boolean; b: boolean }) @{
	const settle = useSettle();
	<>
		@if (settle(props.a)) {
			<span>{'a'}</span>
		}
		@if (props.b) {
			<span>{'b'}</span>
		}
	</>
}

export function ReplayedIfs(props: { a: boolean; b: boolean }) @{
	<main>
		<IfPair a={props.a} b={props.b} />
	</main>
}

function ComponentThenIf(props: { a: boolean; b: boolean }) @{
	const settle = useSettle();
	<>
		<OnlyA a={settle(props.a)} />
		@if (props.b) {
			<span>{'b'}</span>
		}
	</>
}

export function ReplayedComponent(props: { a: boolean; b: boolean }) @{
	<main>
		<ComponentThenIf a={props.a} b={props.b} />
	</main>
}
