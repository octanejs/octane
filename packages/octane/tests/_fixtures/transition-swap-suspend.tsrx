import { use, useState, useTransition } from 'octane';

// Differential fixture for the transition REPLACE-suspend hold: a @try whose body
// SWAPS one component (A) for a DIFFERENT one (B) that suspends on mount, driven by
// useTransition. React keeps A on screen (no blank, no fallback flash) until B's
// promise resolves; octane must match.

function A() @{
	<span id="content">{'A'}</span>
}

function B(props) @{
	const v = use(props.promise);
	<span id="content">{'B-' + v as string}</span>
}

export function SwapSuspend(props) @{
	const [showB, setShowB] = useState(false);
	const [isPending, start] = useTransition();
	<div>
		<button id="go" onClick={() => start(() => setShowB(true))}>{'go'}</button>
		<span id="pending">
			{isPending ? 'pending' : 'idle'}
		</span>
		@try {
			@if (showB) {
				<B promise={props.promise} />
			} @else {
				<A />
			}
		} @pending {
			<span id="fallback">{'fallback'}</span>
		}
	</div>
}
