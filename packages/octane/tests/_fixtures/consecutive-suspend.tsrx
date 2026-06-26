import { use, useState } from 'octane';

// Regression fixture for the consecutive-suspend stuck-fallback bug. A `@try`
// body wraps a CHILD component that suspends on a query promise. Resolving the
// first promise drives the child's OWN re-render (via its setState — mirroring
// how `useSuspenseQuery` re-renders its subscriber when the query settles),
// which then suspends AGAIN on a DIFFERENT promise (the second consecutive
// `useSuspenseQuery`). When that resolves the content must mount AND the
// `@pending` fallback must be removed — not left stacked above the content.

let _swap: any = null;

// Drive the child to swap to its second query promise — emulates a second
// `useSuspenseQuery` becoming the active suspender after the first resolved.
export function swapToSecond() {
	_swap();
}

function TwiceSuspending(props) @{
	const [phase, setPhase] = useState(0);
	_swap = () => setPhase(1);
	const active =
		phase === 0 ? props.a : props.b;
	const value = use(active);
	<div class="content">
		{value as string}
	</div>
}

export function ConsecutiveSuspend(props) @{
	<>
		@try {
			<TwiceSuspending a={props.a} b={props.b} />
		} @pending {
			<div class="fallback">{'loading'}</div>
		}
	</>
}
