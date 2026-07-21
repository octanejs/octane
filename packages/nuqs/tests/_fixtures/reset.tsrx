import { NuqsTestingAdapter, type OnUrlUpdateFunction } from '@octanejs/nuqs/adapters/testing';
import { parseAsString, useQueryStates } from '@octanejs/nuqs';

// Reproduces the "reset every render" hazard: a debounced write to `a` is
// queued, then an immediate write to `b` commits and — via hasMemory's
// setSearchParams — re-renders the adapter. If the adapter reset the shared
// queue on that re-render, the still-pending debounced `a` write would be
// aborted and never reach the URL.
function TwoWrites() @{
	const [{ a, b }, set] = useQueryStates({
		a: parseAsString,
		b: parseAsString,
	});
	<div>
		<span id="a">{'a=' + (a ?? '') as string}</span>
		<span id="b">{'b=' + (b ?? '') as string}</span>
		<button
			id="set-a-debounced"
			onClick={() => set({ a: 'x' }, { limitUrlUpdates: { method: 'debounce', timeMs: 40 } })}
		>{'a'}</button>
		<button id="set-b-now" onClick={() => set({ b: 'y' })}>{'b'}</button>
	</div>
}

export function ResetApp(props: { onUrlUpdate?: OnUrlUpdateFunction }) @{
	<NuqsTestingAdapter onUrlUpdate={props.onUrlUpdate} hasMemory={true}>
		<TwoWrites />
	</NuqsTestingAdapter>
}
