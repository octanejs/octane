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

// Calls a hook, so it renders through a full component slot.
function StatefulA(props: { a: boolean }) @{
	const [label] = useState('a');
	@if (props.a) {
		<span>{label as string}</span>
	}
}

function Nothing() @{
	<></>
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

function IfThenSwitch(props: { a: boolean; b: boolean }) @{
	const settle = useSettle();
	<>
		@if (settle(props.a)) {
			<span>{'a'}</span>
		}
		@switch (props.b) {
			@case true: {
				<span>{'b'}</span>
			}
		}
	</>
}

export function ReplayedIfThenSwitch(props: { a: boolean; b: boolean }) @{
	<main>
		<IfThenSwitch a={props.a} b={props.b} />
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

// The update is scheduled while an earlier sibling's arguments are evaluated:
// that call and the later @if both wait for the replay to create their slots.
function LiteThenIf(props: { a: boolean; b: boolean }) @{
	const settle = useSettle();
	<>
		<OnlyA a={settle(props.a)} />
		@if (props.b) {
			<span>{'b'}</span>
		}
		<Nothing />
	</>
}

export function ReplayedLiteBeforeIf(props: { a: boolean; b: boolean }) @{
	<main>
		<LiteThenIf a={props.a} b={props.b} />
	</main>
}

function StatefulThenIf(props: { a: boolean; b: boolean }) @{
	const settle = useSettle();
	<>
		<StatefulA a={settle(props.a)} />
		@if (props.b) {
			<span>{'b'}</span>
		}
		<Nothing />
	</>
}

export function ReplayedComponentBeforeIf(props: { a: boolean; b: boolean }) @{
	<main>
		<StatefulThenIf a={props.a} b={props.b} />
	</main>
}
