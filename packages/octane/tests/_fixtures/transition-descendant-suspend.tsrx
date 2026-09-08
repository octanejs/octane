import { use, useLayoutEffect, useReducer, useState, useTransition } from 'octane';

// ---------------------------------------------------------------------------
// Regression fixtures for the transition-priority DESCENDANT re-suspend hold.
//
// A `@try`/`@pending` boundary wraps a child component `Child` that holds its
// OWN value state and calls `use(promiseFor(value))`, so the child suspends per
// value. When the value changes, the child independently schedules the update. React's `useTransition` contract: when
// that re-render is at transition priority and the boundary already has
// committed content, the previously committed content stays on screen until the
// new tree is ready — NO fallback flash. A non-transition (urgent) re-suspend
// SHOULD swap to the @pending fallback.
//
// The sibling probe owns no actions and must stay idle while a descendant's
// separately owned transition holds its content.

interface ReaderProps {
	promiseFor: (value: number) => PromiseLike<number>;
	revision?: number;
	useReducer?: boolean;
	failOnRevision?: boolean;
}

interface ParentProps extends ReaderProps {
	bindParent: (update: () => void) => void;
	onLayout: (revision: number) => void;
}

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
function TransitionChild(props: ReaderProps) @{
	const [value, setValue] =
		props.useReducer ? useReducer((_value: number, next: number) => next, 1) : useState(1);
	const [isPending, start] = useTransition();
	_setValueTransition = (v) => start(() => setValue(v));
	_setValueUrgent = (v) => setValue(v);
	if (props.failOnRevision && props.revision) throw new Error('urgent child error');
	const v = use(props.promiseFor(value));
	<span
		id="content"
		data-pending={isPending ? 'pending' : 'idle'}
		data-parent={props.revision}
	>{'content-' + v as string}</span>
}

function UrgentChild(props: ReaderProps) @{
	const [value, setValue] = useState(1);
	_setValueUrgent = (v) => setValue(v);
	const v = use(props.promiseFor(value));
	<span id="content">{'content-' + v as string}</span>
}

export function TransitionDescendantSuspend(props: ReaderProps) @{
	<div>
		<PendingProbe />
		@try {
			<TransitionChild promiseFor={props.promiseFor} />
		} @pending {
			<span id="fallback">{'fallback'}</span>
		}
	</div>
}

export function UrgentParentWithTransitionChild(props: ParentProps) @{
	const [revision, setRevision] = useState(0);
	props.bindParent(() => setRevision((value) => value + 1));
	useLayoutEffect(() => props.onLayout(revision), [revision]);
	<div data-revision={revision}>
		<PendingProbe />
		@try {
			<TransitionChild
				promiseFor={props.promiseFor}
				revision={revision}
				useReducer={props.useReducer}
				failOnRevision={props.failOnRevision}
			/>
		} @pending {
			<span id="fallback">{'fallback'}</span>
		} @catch (error) {
			<span role="alert">{(error as Error).message as string}</span>
		}
	</div>
}

export function UrgentDescendantSuspend(props: ReaderProps) @{
	<div>
		@try {
			<UrgentChild promiseFor={props.promiseFor} />
		} @pending {
			<span id="fallback">{'fallback'}</span>
		}
	</div>
}
