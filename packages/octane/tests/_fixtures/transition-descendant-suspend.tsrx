import { use, useState, useTransition } from 'octane';

// ---------------------------------------------------------------------------
// Regression fixtures for the transition-priority DESCENDANT re-suspend hold.
//
// A `@try`/`@pending` boundary wraps a child component `Child` that holds its
// OWN value state and calls `use(promiseFor(value))`, so the child suspends per
// value. When the value changes, the CHILD re-renders on its OWN (the suspend
// originates in a descendant block, NOT the try-body block — handleSuspense
// sees sourceBlock === the child block). React's `useTransition` contract: when
// that re-render is at transition priority and the boundary already has
// committed content, the previously committed content stays on screen until the
// new tree is ready — NO fallback flash. A non-transition (urgent) re-suspend
// SHOULD swap to the @pending fallback.
//
// The sibling probe owns no actions and must stay idle while a descendant's
// separately owned transition holds its content.

let _setValueTransition: ((v: number) => void) | null = null;
let _setValueUrgent: ((v: number) => void) | null = null;

/** Change the child's value inside a transition (deferred descendant suspend). */
export function setValueTransition(v: number): void {
	_setValueTransition!(v);
}

/** Change the child's value urgently (non-transition descendant suspend). */
export function setValueUrgent(v: number): void {
	_setValueUrgent!(v);
}

function PendingProbe() @{
	const [isPending] = useTransition();
	<span id="pending">
		{isPending ? 'pending' : 'idle'}
	</span>
}

// The child OWNS its value state, so changing it re-renders ONLY the child —
// the re-suspend originates in this descendant block. `start` (a useTransition
// setter) makes the value change transition-priority.
function TransitionChild(props) @{
	const [value, setValue] = useState(1);
	const [, start] = useTransition();
	_setValueTransition = (v) => start(() => setValue(v));
	const v = use(props.promiseFor(value));
	<span id="content">{'content-' + v as string}</span>
}

function UrgentChild(props) @{
	const [value, setValue] = useState(1);
	_setValueUrgent = (v) => setValue(v);
	const v = use(props.promiseFor(value));
	<span id="content">{'content-' + v as string}</span>
}

export function TransitionDescendantSuspend(props) @{
	<div>
		<PendingProbe />
		@try {
			<TransitionChild promiseFor={props.promiseFor} />
		} @pending {
			<span id="fallback">{'fallback'}</span>
		}
	</div>
}

export function UrgentDescendantSuspend(props) @{
	<div>
		@try {
			<UrgentChild promiseFor={props.promiseFor} />
		} @pending {
			<span id="fallback">{'fallback'}</span>
		}
	</div>
}
