import { useDeferredValue, useLayoutEffect } from 'octane';

interface DeferredProbeProps {
	value: number;
	onCommit: (value: number, deferred: number) => void;
}

// Fixture for deferred-value-task.test.ts (#1864). Every commit reports the
// urgent value next to the deferred value that rendered with it, from a layout
// effect, so the test can arm a host task inside a specific commit.
export function DeferredProbe(props: DeferredProbeProps) @{
	const deferred = useDeferredValue(props.value);
	useLayoutEffect(() => {
		props.onCommit(props.value, deferred);
	}, null);
	<span>{`${props.value}/${deferred}`}</span>
}

// Two components deferring the same value, to observe whether their deferred
// renders commit together.
export function DeferredPair(props: DeferredProbeProps) @{
	<>
		<DeferredProbe value={props.value} onCommit={props.onCommit} />
		<DeferredProbe value={props.value} onCommit={props.onCommit} />
	</>
}
