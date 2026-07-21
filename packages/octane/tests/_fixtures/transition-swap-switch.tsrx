import { use, useState, useTransition } from 'octane';

function A() @{
	<span id="content">{'A'}</span>
}
function Sus(props) @{
	const v = use(props.promise);
	<span id="content">{'B-' + v as string}</span>
}

// switchBlock replace-suspend: a transition changes the discriminant 0→1, where case 1
// suspends on mount. The committed case-0 (A) must hold until it resolves.
export function SwitchSwap(props) @{
	const [n, setN] = useState(0);
	const [isPending, start] = useTransition();
	<div>
		<button id="go" onClick={() => start(() => setN(1))}>{'go'}</button>
		<span id="pending">
			{isPending ? 'pending' : 'idle'}
		</span>
		@try {
			@switch (n) {
				@case 0: {
					<A />
				}
				@case 1: {
					<Sus promise={props.promise} />
				}
			}
		} @pending {
			<span id="fallback">{'fallback'}</span>
		}
	</div>
}
