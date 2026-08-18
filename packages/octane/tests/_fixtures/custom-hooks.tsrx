import { useState, useEffect, useCallback } from 'octane';

// A user-defined custom hook with multiple base hooks. "Hooks everywhere": the
// compiler slots its base hooks even though it's a plain function, not a
// component — and a component calling it wraps the call in `withSlot` so the
// SAME hook reused at two call sites keeps independent state.
function useCounter(start) {
	const [n, setN] = useState(start);
	const [touched, setTouched] = useState(false);
	return {
		n,
		touched,
		inc: () => {
			setN(n + 1);
			setTouched(true);
		},
	};
}

// Custom hook composing another custom hook (nested).
function useLabelledCounter(start, label) {
	const c = useCounter(start);
	return { text: label + ':' + c.n, inc: c.inc };
}

export function ReuseApp() @{
	const a = useCounter(0);
	const b = useCounter(100);
	<div>
		<button class="a" onClick={a.inc}>{a.n as string}</button>
		<button class="b" onClick={b.inc}>{b.n as string}</button>
		<span class="ta">{(a.touched ? 'y' : 'n') as string}</span>
	</div>
}

export function NestedApp() @{
	const c = useLabelledCounter(5, 'x');
	<button class="n" onClick={c.inc}>{c.text as string}</button>
}

export interface CallbackSet {
	explicit: () => string;
	inferred: () => string;
	always: () => string;
	initial: () => string;
}

export interface CallbackSnapshot {
	left: CallbackSet | null;
	right: CallbackSet;
}

export interface CallbackReuseProps {
	left: string;
	right: string;
	revision: number;
	showLeft: boolean;
	observe: (callbacks: CallbackSnapshot) => void;
	onResult: (value: string) => void;
}

function useCallbackSet(label: string, revision: number): CallbackSet {
	const explicit = useCallback(() => label, [label]);
	const inferred = useCallback(() => label);
	const always = useCallback(() => label + ':' + revision, null);
	const initial = useCallback(() => label, []);
	return { explicit, inferred, always, initial };
}

function useNestedCallbackSet(label: string, revision: number): CallbackSet {
	return useCallbackSet(label, revision);
}

function describeCallbacks(callbacks: CallbackSet): string {
	return [callbacks.explicit(), callbacks.inferred(), callbacks.always(), callbacks.initial()].join(
		'|',
	);
}

export function CallbackReuseApp(props: CallbackReuseProps) @{
	let left: CallbackSet | null = null;
	if (props.showLeft) left = useNestedCallbackSet(props.left, props.revision);
	const right = useNestedCallbackSet(props.right, props.revision);
	props.observe({ left, right });
	<div>
		<button
			class="left-callback"
			disabled={left === null}
			onClick={() => {
				if (left !== null) props.onResult(describeCallbacks(left));
			}}
		>Left</button>
		<button class="right-callback" onClick={() => props.onResult(describeCallbacks(right))}>
			Right
		</button>
	</div>
}
