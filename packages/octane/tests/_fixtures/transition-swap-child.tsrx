import { use, useState, useTransition } from 'octane';

// childSlot-shaped replace-suspend (a renderable HOLE inside a host element whose
// component identity changes A→B under a transition, B suspending on mount). Mirrors
// the router's dynamic `<Comp/>` swap, but via childSlot rather than componentSlot.

function A() @{
	<span id="content">{'A'}</span>
}

function B(props) @{
	const v = use(props.promise);
	<span id="content">
		{'B-' + v as string}
	</span>
}

export function SwapChild(props) @{
	const [showB, setShowB] = useState(false);
	const [isPending, start] = useTransition();
	<div>
		<button id="go" onClick={() => start(() => setShowB(true))}>{'go'}</button>
		<span id="pending">
			{isPending ? 'pending' : 'idle'}
		</span>
		@try {
			<div class="slot">
				{showB ? <B promise={props.promise} /> : <A />}
			</div>
		} @pending {
			<span id="fallback">{'fallback'}</span>
		}
	</div>
}
